import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
const ACK_TIMEOUT_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const MEDIA_CONNECT_TIMEOUT_MS = 20_000;
const MAX_AUTO_RETRIES = 2;
const NO_RETRY_REASONS = ["duration_limit", "inactivity_timeout"];

export type LiveEvent = {
  type: string;
  reason?: string;
  error?: { message?: string };
  usage?: { seconds?: number };
  finalized?: boolean;
  transport?: { type?: string; sdp?: string };
  [key: string]: unknown;
};

type LiveState = {
  status: "idle" | "connecting" | "connected" | "stopping" | "closed";
  error: string | null;
  hasConnected: boolean;
  finalized: boolean | null;
  muted: boolean;
  playbackBlocked: boolean;
  audioStarted: boolean;
};

const initialState: LiveState = {
  status: "idle",
  error: null,
  hasConnected: false,
  finalized: null,
  muted: false,
  playbackBlocked: false,
  audioStarted: false,
};

export function useLiveVoice(
  options: {
    url?: string;
    startPayload?: () => Record<string, unknown>;
    onEvent?: (event: LiveEvent) => void | Promise<void>;
  } = {},
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const controller = useRef<ReturnType<typeof createLiveVoice> | null>(null);
  const mounted = useRef(false);
  const latest = useRef(options);
  const userStopped = useRef(false);
  const retries = useRef(0);
  const startRef = useRef<() => void>(() => {});
  const [call, setCall] = useState(initialState);

  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      userStopped.current = true;
      const voice = controller.current;
      controller.current = null;
      voice?.stop();
    };
  }, []);

  const startCall = useCallback(() => {
    if (!mounted.current || controller.current) return;
    const audio = audioRef.current;
    if (!audio) {
      setCall((previous) => ({ ...previous, error: "Voice playback is not mounted." }));
      return;
    }
    let endpoint: URL;
    try {
      endpoint = new URL(latest.current.url ?? "/api/live", window.location.href);
      if (endpoint.protocol === "https:") endpoint.protocol = "wss:";
      if (endpoint.protocol === "http:") endpoint.protocol = "ws:";
    } catch {
      setCall((previous) => ({ ...previous, error: "Invalid voice connection URL." }));
      return;
    }
    let sawConnected = false;
    let sawError = false;
    let noRetry = false;
    const voice = createLiveVoice({
      url: endpoint.href,
      audio,
      startPayload: latest.current.startPayload?.() ?? {},
      onEvent(event) {
        if (!mounted.current || controller.current !== voice) return;
        if (typeof event.reason === "string" && NO_RETRY_REASONS.includes(event.reason)) {
          noRetry = true;
        }
        if (event.type === "app.connected") {
          sawConnected = true;
          setCall((previous) => ({ ...previous, status: "connected", hasConnected: true }));
        } else if (event.type === "app.audio.started") {
          setCall((previous) => ({ ...previous, audioStarted: true }));
        } else if (event.type === "app.stopping") {
          setCall((previous) => ({ ...previous, status: "stopping", playbackBlocked: false, audioStarted: false }));
        } else if (event.type === "app.closed") {
          controller.current = null;
          const shouldRetry =
            sawConnected &&
            sawError &&
            !noRetry &&
            !userStopped.current &&
            mounted.current &&
            retries.current < MAX_AUTO_RETRIES;
          if (shouldRetry) {
            retries.current += 1;
            setCall({ ...initialState, status: "connecting", hasConnected: true });
            setTimeout(() => {
              if (mounted.current && !userStopped.current && !controller.current) startRef.current();
            }, 1500);
          } else {
            setCall((previous) => ({
              ...previous,
              status: "closed",
              muted: false,
              playbackBlocked: false,
              audioStarted: false,
              finalized: event.finalized === true,
            }));
          }
        } else if (event.type === "app.playback.blocked" || event.type === "app.playback.resumed") {
          setCall((previous) => ({ ...previous, playbackBlocked: event.type === "app.playback.blocked" }));
        } else if (["app.error", "app.greeting.error", "gateway.error", "error"].includes(event.type)) {
          if (event.type === "app.error" || event.type === "gateway.error") sawError = true;
          setCall((previous) => ({ ...previous, error: event.error?.message ?? "Voice request failed." }));
        }
        try {
          void Promise.resolve(latest.current.onEvent?.(event)).catch((error) => {
            console.error("Live UI event handler failed", error);
          });
        } catch (error) {
          console.error("Live UI event handler failed", error);
        }
      },
    });
    controller.current = voice;
    setCall({ ...initialState, status: "connecting" });
    void voice.start();
  }, []);

  startRef.current = startCall;

  const start = useCallback(() => {
    retries.current = 0;
    userStopped.current = false;
    startCall();
  }, [startCall]);

  const stop = useCallback(() => {
    userStopped.current = true;
    controller.current?.stop();
  }, []);
  const setMuted = useCallback((muted: boolean) => {
    if (controller.current?.setMuted(muted)) setCall((previous) => ({ ...previous, muted }));
  }, []);
  const resumePlayback = useCallback(() => {
    void controller.current?.resumePlayback();
  }, []);

  return { ...call, audioRef, start, stop, setMuted, resumePlayback };
}

type LiveOptions = {
  url: string;
  startPayload: Record<string, unknown>;
  audio: HTMLAudioElement;
  onEvent: (event: LiveEvent) => void;
};

function createLiveVoice(options: LiveOptions) {
  let state: "idle" | "starting" | "active" | "stopping" | "closed" = "idle";
  let socket: WebSocket | undefined;
  let peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let microphone: MediaStream | undefined;
  let playback: MediaStream | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let cancelGathering: (() => void) | undefined;
  let lastAck = 0;
  let lastHeartbeat = 0;
  let answerReceived = false;
  let finalized = false;
  let muted = false;

  function starting() {
    return state === "starting";
  }

  function send(event: object) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  }

  function stopAudio() {
    microphone?.getTracks().forEach((track) => track.stop());
    playback?.getTracks().forEach((track) => track.removeEventListener("unmute", remoteAudioStarted));
    if (options.audio.srcObject) {
      options.audio.pause();
      options.audio.srcObject = null;
    }
  }

  function release() {
    if (state === "closed") return;
    state = "closed";
    clearInterval(heartbeat);
    clearTimeout(deadline);
    cancelGathering?.();
    window.removeEventListener("pagehide", stop);
    stopAudio();
    channel?.close();
    peer?.close();
    socket?.close();
    options.onEvent({ type: "app.closed", finalized });
  }

  function stop() {
    if (state === "stopping" || state === "closed") return;
    state = "stopping";
    try {
      send({ type: "session.close" });
    } catch {
      return release();
    }
    stopAudio();
    cancelGathering?.();
    clearInterval(heartbeat);
    clearTimeout(deadline);
    deadline = setTimeout(release, 15_000);
    options.onEvent({ type: "app.stopping" });
    if (!socket || socket.readyState !== WebSocket.OPEN) release();
  }

  function setMuted(value: boolean) {
    if (state !== "starting" && state !== "active") return false;
    muted = value;
    microphone?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    return true;
  }

  async function resumePlayback() {
    if (state !== "starting" && state !== "active") return false;
    options.audio.muted = false;
    options.audio.volume = 1;
    if (!options.audio.srcObject) return false;
    try {
      await options.audio.play();
      if (state === "starting" || state === "active") options.onEvent({ type: "app.playback.resumed" });
      return state === "starting" || state === "active";
    } catch {
      if (state === "starting" || state === "active") options.onEvent({ type: "app.playback.blocked" });
      return false;
    }
  }

  async function remoteAudioStarted() {
    if (state !== "starting" && state !== "active") return;
    const playing = await resumePlayback();
    const track = playback?.getAudioTracks()[0];
    if (playing && track && !track.muted && (state === "starting" || state === "active")) {
      options.onEvent({ type: "app.audio.started" });
    }
  }

  function fail(message: string) {
    if (state === "stopping" || state === "closed") return;
    options.onEvent({ type: "app.error", error: { message } });
    stop();
  }

  function reportUnexpectedClosure(reason?: string) {
    if (state === "stopping" || state === "closed") return;
    const messages: Record<string, string> = {
      startup_timeout: "Voice startup timed out. Start a new call to retry.",
      initial_heartbeat_timeout: "Voice media did not connect. Start a new call to retry.",
      heartbeat_timeout: "Voice connection was lost. Start a new call to retry.",
      gateway_shutdown: "The voice service restarted. Start a new call to reconnect.",
      inactivity_timeout: "The voice call ended after inactivity.",
      duration_limit: "The voice call reached its duration limit. Start a new call to continue.",
    };
    options.onEvent({
      type: "app.error",
      error: { message: messages[reason ?? ""] ?? "The voice call ended unexpectedly. Start a new call to retry." },
    });
  }

  function mediaReady() {
    return peer?.connectionState === "connected" && channel?.readyState === "open";
  }

  function pulse() {
    if (state !== "active") return;
    if (Date.now() - lastAck >= ACK_TIMEOUT_MS) return fail("Voice control connection lost");
    if (Date.now() - lastHeartbeat >= HEARTBEAT_TIMEOUT_MS) return fail("Voice media connection lost");
    if (!mediaReady()) return;
    try {
      send({ type: "gateway.heartbeat" });
      lastHeartbeat = Date.now();
    } catch {
      fail("Voice control connection failed");
    }
  }

  function activate() {
    if (!answerReceived || !mediaReady()) return;
    if (starting()) {
      state = "active";
      clearTimeout(deadline);
      lastAck = Date.now();
      lastHeartbeat = Date.now();
      heartbeat = setInterval(pulse, 1000);
      pulse();
      if (state !== "active") return;
      send({ type: "app.ready" });
      options.onEvent({ type: "app.connected" });
    } else pulse();
  }

  async function applyAnswer(event: LiveEvent) {
    if (!starting() || !peer) return;
    if (answerReceived || event.transport?.type !== "webrtc" || !event.transport.sdp) {
      throw new Error("Invalid voice session answer");
    }
    answerReceived = true;
    clearTimeout(deadline);
    deadline = setTimeout(
      () => fail("Voice media did not connect in time. Start a new call to retry."),
      MEDIA_CONNECT_TIMEOUT_MS,
    );
    await peer.setRemoteDescription({ type: "answer", sdp: event.transport.sdp });
    activate();
  }

  async function gatherCandidates(connection: RTCPeerConnection) {
    if (connection.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error("Voice network setup timed out")), 10_000);
      function finish(error?: Error) {
        clearTimeout(timeout);
        connection.removeEventListener("icegatheringstatechange", changed);
        cancelGathering = undefined;
        if (error) reject(error);
        else resolve();
      }
      function changed() {
        if (connection.iceGatheringState === "complete") finish();
      }
      cancelGathering = () => finish(new Error("Call ended"));
      connection.addEventListener("icegatheringstatechange", changed);
      changed();
    });
  }

  async function start() {
    if (state !== "idle") return;
    state = "starting";
    window.addEventListener("pagehide", stop);
    options.audio.muted = false;
    options.audio.volume = 1;
    options.audio.srcObject = new MediaStream();
    void options.audio.play().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      microphone = stream;
      if (!starting()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peer = connection;
      for (const track of stream.getAudioTracks()) {
        track.enabled = !muted;
        track.addEventListener("ended", stop);
        connection.addTrack(track, stream);
      }
      connection.addEventListener("track", ({ track }) => {
        if (state === "stopping" || state === "closed") return;
        playback = new MediaStream([track]);
        options.audio.srcObject = playback;
        track.addEventListener("unmute", remoteAudioStarted);
        void remoteAudioStarted();
      });
      connection.addEventListener("connectionstatechange", () => {
        if (connection.connectionState === "failed") fail("Voice media connection failed. Start a new call to retry.");
        else if (connection.connectionState === "closed") fail("Voice media connection closed");
        else activate();
      });
      channel = connection.createDataChannel("oai-events");
      channel.addEventListener("open", activate);
      channel.addEventListener("message", ({ data }) => {
        try {
          const event: LiveEvent = JSON.parse(data);
          if (event.type === "session.started") {
            activate();
          }
        } catch {
          fail("Invalid voice session event");
        }
      });
      channel.addEventListener("error", () => fail("Voice media connection failed"));
      channel.addEventListener("close", stop);
      await connection.setLocalDescription(await connection.createOffer());
      if (!starting()) return;
      await gatherCandidates(connection);
      if (!starting()) return;
      const sdp = connection.localDescription?.sdp;
      if (!sdp) throw new Error("Missing voice session offer");
      socket = new WebSocket(options.url);
      deadline = setTimeout(() => fail("Voice session did not start"), 50_000);
      socket.onopen = () => {
        if (!starting()) return release();
        send({ ...options.startPayload, type: "app.start", sdp });
      };
      socket.onmessage = ({ data }) => {
        try {
          const event: LiveEvent = JSON.parse(data);
          if (event.type === "gateway.session.created") {
            void applyAnswer(event).catch(() => fail("Voice media negotiation failed"));
          } else if (event.type === "session.started") {
            activate();
          } else if (event.type === "gateway.heartbeat.ack") {
            lastAck = Date.now();
          } else if (event.type === "session.closed") {
            finalized =
              typeof event.usage?.seconds === "number" &&
              Number.isFinite(event.usage.seconds) &&
              event.usage.seconds >= 0;
            reportUnexpectedClosure(event.reason);
            options.onEvent(event);
            return release();
          } else if (
            event.type === "gateway.session.closing" ||
            event.type === "gateway.error" ||
            event.type === "app.error"
          ) {
            if (event.type === "gateway.session.closing") reportUnexpectedClosure(event.reason);
            options.onEvent(event);
            return stop();
          }
          options.onEvent(event);
        } catch {
          fail("Invalid voice event");
        }
      };
      socket.onerror = () => fail("Voice connection failed");
      socket.onclose = () => {
        if (state !== "stopping" && state !== "closed") {
          options.onEvent({ type: "app.error", error: { message: "Voice control connection closed" } });
        }
        release();
      };
    } catch (error) {
      fail(error instanceof Error ? error.message : "Microphone startup failed");
    }
  }

  return { start, stop, setMuted, resumePlayback };
}
