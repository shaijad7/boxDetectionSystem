"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";

interface Session {
    session_id: string;
    video_source: string;
    started_at: string;
    total_boxes_detected: number;
    per_frame_counts?: number[];
    frames_processed: number;
}

export default function DetectionHeatmap() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [heatData, setHeatData] = useState<number[][]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSessions = async () => {
            const q = query(collection(db, "detection_sessions"), orderBy("started_at", "desc"), limit(20));
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ session_id: d.id, ...d.data() } as Session));
            setSessions(data);
            if (data.length > 0) setSelectedId(data[0].session_id);
            setLoading(false);
        };
        fetchSessions();
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        const session = sessions.find(s => s.session_id === selectedId);
        if (!session) return;

        // Build a 10x10 grid "heatmap" from per-frame counts
        const counts = session.per_frame_counts ?? Array(session.frames_processed || 10).fill(session.total_boxes_detected > 0 ? 1 : 0);
        const gridSize = 10;
        const grid: number[][] = Array.from({ length: gridSize }, (_, row) =>
            Array.from({ length: gridSize }, (_, col) => {
                const idx = Math.floor((row * gridSize + col) * counts.length / (gridSize * gridSize));
                return counts[idx] ?? 0;
            })
        );
        setHeatData(grid);
    }, [selectedId, sessions]);

    const maxVal = Math.max(1, Math.max(...heatData.flatMap(r => r)));

    const colorForValue = (v: number) => {
        const intensity = v / maxVal;
        const r = Math.round(239 * intensity);
        const g = Math.round(68 * (1 - intensity));
        const b = Math.round(68 * (1 - intensity));
        return intensity > 0.05
            ? `rgba(${r},${g},${b},${0.2 + intensity * 0.8})`
            : "rgba(30,41,59,0.4)";
    };

    if (loading) return <div className="text-slate-400 animate-pulse p-6">Loading sessions...</div>;

    if (sessions.length === 0) return (
        <div className="text-slate-500 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
            No detection sessions found. Run a detection first.
        </div>
    );

    const selected = sessions.find(s => s.session_id === selectedId);

    return (
        <div className="space-y-6">
            {/* Session Selector */}
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 space-y-3">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Select Session</label>
                <select
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50 transition-all text-sm"
                >
                    {sessions.map(s => (
                        <option key={s.session_id} value={s.session_id}>
                            {s.video_source} — {new Date(s.started_at).toLocaleDateString()} ({s.total_boxes_detected} boxes)
                        </option>
                    ))}
                </select>
                {selected && (
                    <div className="flex gap-4 text-sm text-slate-400">
                        <span>📦 <span className="text-green-400 font-bold">{selected.total_boxes_detected}</span> boxes</span>
                        <span>🎞 <span className="text-blue-400 font-bold">{selected.frames_processed}</span> frames</span>
                    </div>
                )}
            </div>

            {/* Heatmap Grid */}
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">Activity Distribution Grid</h2>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="w-3 h-3 rounded-sm bg-slate-700/50 inline-block"></span>None
                        <span className="w-3 h-3 rounded-sm bg-orange-500/50 inline-block ml-2"></span>Medium
                        <span className="w-3 h-3 rounded-sm bg-red-500 inline-block ml-2"></span>Peak
                    </div>
                </div>
                <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(10, 1fr)` }}
                >
                    {heatData.map((row, rIdx) =>
                        row.map((val, cIdx) => (
                            <div
                                key={`${rIdx}-${cIdx}`}
                                title={`Frame ~${rIdx * 10 + cIdx}: ${val} boxes`}
                                className="aspect-square rounded-sm transition-all duration-300 cursor-pointer hover:scale-110 hover:z-10 relative"
                                style={{ backgroundColor: colorForValue(val) }}
                            />
                        ))
                    )}
                </div>
                <p className="text-xs text-center text-slate-600">Each cell represents a segment of the video timeline — darker = more boxes detected</p>
            </div>
        </div>
    );
}
