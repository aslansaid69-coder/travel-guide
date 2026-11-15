"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  MapPin,
  Play,
  Video,
  ChevronDown,
  X,
} from "lucide-react";
import cameras from "@/data/cameras.json";
type Camera = (typeof cameras)[number];
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
    const timeout = setTimeout(() => setFailed(true), 18000);
    const ready = () => {
      clearTimeout(timeout);
      setPlaying(true);
    };
    const error = () => {
      clearTimeout(timeout);
      setFailed(true);
      setPlaying(false);
    };
    element.addEventListener("playing", ready);
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
      element.removeEventListener("error", error);
    };
  }, [active, failed, camera.type, camera.streamUrl]);
  const fallback = failed || camera.type === "external";
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
                "Connecting…"
              )}
            </span>
          </>
        )}
        {active && !fallback && camera.type === "iframe" && (
          <iframe
            src={camera.streamUrl}
            title={`${camera.name} live webcam`}
            loading="lazy"
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setFailed(true)}
          />
        )}
        {fallback && (
          <div className="camera-fallback">
            <Video size={25} />
            <p>
              {failed
                ? "This feed is taking a break."
                : "Open the camera source"}
            </p>
            <a
              href={camera.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch live <ArrowUpRight size={15} />
            </a>
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
        <a href={camera.sourceUrl} target="_blank" rel="noopener noreferrer">
          Source: {camera.sourceName}
          <ArrowUpRight size={12} />
        </a>
        {active && camera.type === "iframe" && (
          <small>
            Player availability and language are controlled by the provider.
          </small>
        )}
      </div>
    </article>
  );
}
export function LiveCameras() {
  const [all, setAll] = useState(false),
    [time, setTime] = useState("Almaty · UTC+5");
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
              A little closer. <em>Right now.</em>
            </h2>
          </div>
          <div className="live-clock">
            <span className="clock-dot" />
            {time}
          </div>
        </div>
        <p className="section-intro">
          A mountain morning. A change in the clouds. See Almaty as it happens.
        </p>
        <div className="camera-grid">
          {cameras.slice(0, all ? cameras.length : 3).map((camera) => (
            <CameraCard key={camera.id} camera={camera} />
          ))}
        </div>
        <div className="section-bottom">
          <p>
            Live views courtesy of{" "}
            <a
              href="https://world-cam.ru/cams/web-camera-almaty-online/"
              target="_blank"
              rel="noopener noreferrer"
            >
              World-Cam
            </a>
            . Feeds may be temporarily unavailable.
          </p>
          <button
            className="text-button"
            onClick={() => setAll(!all)}
            aria-expanded={all}
          >
            {all ? "Show fewer cameras" : `View all ${cameras.length} cameras`}
            <ChevronDown size={16} className={all ? "rotate-180" : ""} />
          </button>
        </div>
      </div>
    </section>
  );
}
