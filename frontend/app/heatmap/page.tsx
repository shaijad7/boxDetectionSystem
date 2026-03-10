import DetectionHeatmap from "@/components/DetectionHeatmap";
export const metadata = { title: "Detection Heatmap | Box Detection" };
export default function HeatmapPage() {
    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
            <div>
                <h1 className="text-2xl font-bold text-white">Detection Activity Heatmap</h1>
                <p className="text-slate-400 text-sm mt-1">Visualize where boxes appear most frequently across detection sessions.</p>
            </div>
            <DetectionHeatmap />
        </div>
    );
}
