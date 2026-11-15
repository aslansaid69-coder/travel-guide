"use client";
import { T } from "@/components/hub/language";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MapPin, Play, Video, ChevronDown, X } from "lucide-react";
import { WeatherPanel } from "@/components/weather/weather-panel";
import type { Camera } from "@/lib/cameras/types";
function CameraCard({ camera }: { camera: Camera }) {
  const [active, setActive] = useState(false),
    [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!active || failed || camera.type !== "hls" || !video.current) return;
    const element = video.current;
    let disposed = false;
    let hls: import("hls.js").default | undefined;
    let timeout = setTimeout(() => setFailed(true), 18000);
    const ready = () => {
      clearTimeout(timeout);
      setPlaying(true);
    };
    const error = () => {
      clearTimeout(timeout);
      setFailed(true);
      setPlaying(false);
    };
    const idle = () => setPlaying(false);
    const stalled = () => {
      setPlaying(false);
      clearTimeout(timeout);
      timeout = setTimeout(error, 18000);
    };
    element.addEventListener("playing", ready);
    for (const event of ["waiting", "stalled"])
      element.addEventListener(event, stalled);
    for (const event of ["pause", "ended"])
      element.addEventListener(event, idle);
    element.addEventListener("error", error);
    async function load() {
      if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.src = camera.streamUrl;
        void element.play().catch(() => {});
        return;
      }
      try {
        const { default: Hls } = await import("hls.js");
        if (disposed) return;
        if (!Hls.isSupported()) {
          error();
          return;
        }
        hls = new Hls({ maxBufferLength: 20, liveSyncDurationCount: 3 });
        hls.loadSource(camera.streamUrl);
        hls.attachMedia(element);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void element.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) error();
        });
      } catch {
        error();
      }
    }
    void load();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      hls?.destroy();
      element.pause();
      element.removeAttribute("src");
      element.load();
      element.removeEventListener("playing", ready);
      for (const event of ["waiting", "stalled"])
        element.removeEventListener(event, stalled);
      for (const event of ["pause", "ended"])
        element.removeEventListener(event, idle);
      element.removeEventListener("error", error);
    };
  }, [active, failed, camera.type, camera.streamUrl]);
  const fallback = failed;
  return (
    <article className="camera-card">
      <div className="camera-media">
        {(!active || fallback) && (
          <Image
            src={camera.poster}
            alt={camera.posterAlt}
            fill
            sizes="(max-width: 700px) 100vw, 33vw"
            className="cover"
          />
        )}
        {!active && !fallback && (
          <>
            <div className="camera-shade" />
            <span className="camera-tag">
              <Video size={12} /> LIVE WEBCAM
            </span>
            <button
              className="play-button"
              aria-label={`Watch ${camera.name}`}
              onClick={() => {
                setActive(true);
                setFailed(false);
              }}
            >
              <Play size={22} fill="currentColor" />
              <span className="sr-only">Watch camera</span>
            </button>
            <span className="preview-label">
              Scenic preview · tap to connect
            </span>
          </>
        )}
        {active && !fallback && camera.type === "hls" && (
          <>
            <video
              ref={video}
              controls
              autoPlay
              muted
              playsInline
              aria-label={`${camera.name} live stream`}
            />
            <span className="stream-status" role="status">
              {playing ? (
                <>
                  <span className="pulse-dot" />
                  Live now
                </>
              ) : (
                "Connecting or buffering…"
              )}
            </span>
          </>
        )}
        {fallback && (
          <div className="camera-fallback">
            <Video size={25} />
            <p>
              {failed
                ? "This feed is taking a break."
                : "Open the camera source"}
            </p>
            <button
              className="button button-accent"
              onClick={() => {
                setFailed(false);
                setActive(true);
              }}
            >
              Retry stream
            </button>
          </div>
        )}
        {active && (
          <button
            className="close-player"
            aria-label={`Close ${camera.name} player`}
            onClick={() => {
              setActive(false);
              setPlaying(false);
              setFailed(false);
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>
      <div className="camera-info">
        <h3>{camera.name}</h3>
        <p>
          <MapPin size={13} />
          {camera.location}
        </p>
        <span className="camera-source-credit">
          Source: {camera.sourceName}
        </span>
      </div>
    </article>
  );
}
export function LiveCameras() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [all, setAll] = useState(false),
    [time, setTime] = useState("Almaty · UTC+5");
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const response = await fetch("/api/cameras");
        if (!response.ok) return;
        const data = await response.json();
        if (!disposed) setCameras(data.cameras);
      } finally {
        if (!disposed) setLoaded(true);
      }
    }
    void refresh().catch(() => {});
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 60000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const update = () =>
      setTime(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Almaty",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()) + " in Almaty",
      );
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);
  return (
    <section id="live" className="section live-section">
      <div className="shell">
        <div className="section-top">
          <div>
            <p className="eyebrow">
              <span className="tiny-dot" /> A WINDOW INTO THE CITY
            </p>
            <h2>
              <T ru="Чуть ближе.">A little closer.</T>{" "}
              <em>
                <T ru="Прямо сейчас.">Right now.</T>
              </em>
            </h2>
          </div>
          <div className="live-clock">
            <span className="clock-dot" />
            {time}
          </div>
        </div>
        <p className="section-intro">
          <T ru="Горное утро. Плывущие облака. Посмотрите на Алматы в прямом эфире.">
            A mountain morning. A change in the clouds. See Almaty as it
            happens.
          </T>
        </p>
        <div className="live-hub-grid">
          <div className="live-camera-column">
            <div className="camera-grid">
              {cameras.slice(0, all ? cameras.length : 3).map((camera) => (
                <CameraCard key={camera.id} camera={camera} />
              ))}
            </div>
            {!cameras.length && (
              <div className="empty-state">
                <Video />
                <p>
                  {loaded
                    ? "The cameras are taking a short break. Please check back soon."
                    : "Checking live views…"}
                </p>
              </div>
            )}
            <div className="section-bottom">
              <p>
                Direct streams by ipcam.kz. The live badge appears only during
                video playback.
              </p>
              {cameras.length > 3 && (
                <button
                  className="text-button"
                  onClick={() => setAll(!all)}
                  aria-expanded={all}
                >
                  {all
                    ? "Show fewer cameras"
                    : `View all ${cameras.length} cameras`}
                  <ChevronDown size={16} className={all ? "rotate-180" : ""} />
                </button>
              )}
            </div>
          </div>
          <WeatherPanel />
        </div>
      </div>
    </section>
  );
}
