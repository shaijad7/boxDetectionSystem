"use client";

import { useState, useCallback, useRef } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import WebcamPlayer from "@/components/WebcamPlayer";
import BoxCounter from "@/components/BoxCounter";
import { detectFile, saveWebcamSession, stopDetectionJob } from "@/lib/api";
import type { DetectionResult, ImageDetectionResult, VideoDetectionResult } from "@/lib/api";

export default function UploadPage() {
    const [result, setResult] = useState<DetectionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confidence, setConfidence] = useState(0.5);
    const [currentFile, setCurrentFile] = useState<File | null>(null);
    const [playerKey, setPlayerKey] = useState(0);
    const [useWebcam, setUseWebcam] = useState(false);
    const activeJobIdRef = useRef<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const stopDetection = useCallback(() => {
        // Instantly kill frontend fetch request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Tell backend to stop spinning CPU
        if (activeJobIdRef.current) {
            stopDetectionJob(activeJobIdRef.current).catch(console.error);
        }
    }, []);

    const handleFile = useCallback(
        async (file: File) => {
            setCurrentFile(file);
            setError(null);
            setResult(null);
            setLoading(true);

            const jobId = Math.random().toString(36).substring(2, 15);
            activeJobIdRef.current = jobId;
            abortControllerRef.current = new AbortController();

            try {
                const res = await detectFile(file, confidence, jobId, abortControllerRef.current.signal);
                setResult(res);
            } catch (e: any) {
                if (e.name === "AbortError") {
                    setError("Detection stopped by user.");
                } else {
                    setError(e.message ?? "Detection failed. Is the backend running?");
                }
            } finally {
                setLoading(false);
                activeJobIdRef.current = null;
                abortControllerRef.current = null;
            }
        },
        [confidence]
    );

    const handleWebcamSessionComplete = useCallback(async (stats: any) => {
        setUseWebcam(false);
        setLoading(true);
        setError(null);
        try {
            const res = await saveWebcamSession(stats);
            setResult(res);
        } catch (e: any) {
            setError(e.message ?? "Failed to save webcam session.");
        } finally {
            setLoading(false);
        }
    }, []);

    const imageResult = result?.source_type === "image" ? (result as ImageDetectionResult) : null;
    const videoResult = result?.source_type === "video" ? (result as VideoDetectionResult) : null;

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Upload & Detect</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                    Upload an image or video to run YOLOv8 box detection.
                </p>
            </div>

            {/* Confidence slider */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-700">
                <div className="flex items-center justify-between sm:w-36 shrink-0">
                    <label className="text-slate-300 text-sm font-medium">
                        Confidence Threshold
                    </label>
                    <span className="text-green-300 font-semibold text-sm sm:hidden">
                        {(confidence * 100).toFixed(0)}%
                    </span>
                </div>
                <input
                    type="range"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={confidence}
                    onChange={(e) => setConfidence(+e.target.value)}
                    className="flex-1 accent-green-400 cursor-pointer w-full"
                />
                <span className="text-green-300 font-semibold text-sm w-10 text-right hidden sm:block">
                    {(confidence * 100).toFixed(0)}%
                </span>
            </div>

            {/* Start Webcam Button - Standalone */}
            {!useWebcam && !loading && !currentFile && (
                <div className="rounded-2xl bg-slate-900/60 border border-slate-700 p-6 flex justify-center w-full">
                    <button
                        onClick={() => {
                            setResult(null);
                            setError(null);
                            setUseWebcam(true);
                        }}
                        className="px-8 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-all border border-slate-600 shadow-lg hover:ring-2 hover:ring-slate-500 hover:ring-offset-2 hover:ring-offset-slate-950 max-w-sm w-full flex items-center justify-center gap-3 group"
                    >
                        <span className="text-2xl leading-none group-hover:scale-110 transition-transform">📷</span>
                        {result || error ? "Start Webcam Again" : "Start Webcam Detection"}
                    </button>
                </div>
            )}

            {/* Main Content Area (Upload / Preview / Webcam) */}
            <div className={`rounded-2xl bg-slate-900/60 border border-slate-700 p-6 ${useWebcam ? 'space-y-6' : ''}`}>
                {!useWebcam ? (
                    <div className="space-y-6">
                        <VideoPlayer
                            key={playerKey}
                            onFileSelected={handleFile}
                            isLoading={loading}
                            annotatedImageB64={imageResult?.annotated_image_b64}
                        />

                        {/* Stop Detection / Loading State */}
                        {loading && currentFile && (
                            <div className="flex justify-center pt-2">
                                <button
                                    onClick={stopDetection}
                                    className="px-6 py-2.5 rounded-xl bg-red-900/40 hover:bg-red-800/60 text-red-100 font-medium transition-colors border border-red-700/50 flex items-center gap-2 mt-4 shadow-md"
                                >
                                    <span className="text-xl leading-none">⏹️</span> Stop Detection
                                </button>
                            </div>
                        )}

                        {/* Detect Again / Upload New File (When original is a file) */}
                        {!loading && (result || error) && currentFile && (
                            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center pt-2 border-t border-slate-800/50">
                                <button
                                    onClick={() => handleFile(currentFile)}
                                    className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors border border-slate-700 flex items-center gap-2 mt-4"
                                >
                                    <span className="text-xl leading-none">↻</span> Detect Again
                                </button>
                                <button
                                    onClick={() => {
                                        setResult(null);
                                        setError(null);
                                        setCurrentFile(null);
                                        setPlayerKey(prev => prev + 1);
                                    }}
                                    className="px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium transition-colors flex items-center gap-2 mt-4 shadow-lg shadow-green-900/20"
                                >
                                    <span className="text-xl leading-none">+</span> Upload New Video
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <WebcamPlayer
                        confidence={confidence}
                        onSessionComplete={handleWebcamSessionComplete}
                        onCancel={() => setUseWebcam(false)}
                    />
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
                    <span className="text-lg">⚠️</span>
                    <span>{error}</span>
                </div>
            )}

            {/* Image result card */}
            {imageResult && (
                <section className="rounded-2xl bg-slate-900/60 border border-green-500/20 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-white">Image Detection Result</h2>
                    <BoxCounter count={imageResult.box_count} label="Boxes Detected" showPulse />
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-slate-800/50 rounded-xl p-3">
                            <div className="text-slate-500 text-xs mb-1">Dimensions</div>
                            <div className="text-slate-200 font-medium">
                                {imageResult.frame_width} × {imageResult.frame_height} px
                            </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-3">
                            <div className="text-slate-500 text-xs mb-1">Confidences</div>
                            <div className="text-slate-200 font-medium">
                                {imageResult.confidences.length > 0
                                    ? imageResult.confidences.map((c) => (c * 100).toFixed(0) + "%").join(", ")
                                    : "—"}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Video result card */}
            {videoResult && (
                <section className="rounded-2xl bg-slate-900/60 border border-green-500/20 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-white">Video Detection Result</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {[
                            { label: "Total Boxes", value: videoResult.total_boxes_detected, color: "text-green-300" },
                            { label: "Frames Processed", value: videoResult.frames_processed, color: "text-blue-300" },
                            { label: "Peak Count", value: videoResult.peak_count, color: "text-pink-300" },
                            { label: "Avg / Frame", value: videoResult.average_boxes_per_frame.toFixed(2), color: "text-yellow-300" },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="bg-slate-800/50 rounded-xl p-4 text-center">
                                <div className={`text-3xl font-extrabold tabular-nums ${color}`}>{value}</div>
                                <div className="text-slate-500 text-xs mt-1 uppercase tracking-wide">{label}</div>
                            </div>
                        ))}
                    </div>
                    {videoResult.document_id && (
                        <p className="text-slate-600 text-xs">
                            Session saved to Firebase · ID: <code className="text-slate-500">{videoResult.document_id}</code>
                        </p>
                    )}
                </section>
            )}
        </div>
    );
}
