import { CheckCircleIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { PLATFORMS } from "../assets/assets";

interface PlatformPickerModalProps {
    connectedIds: string[];
    connecting: string | null;
    onClose: () => void;
    onConnect: (platformId: string) => void;
}

const PlatformPickerModal = ({ connectedIds, connecting, onClose, onConnect }: PlatformPickerModalProps) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 shadow">
                    <h3 className="text-slate-700 font-semibold"> Choose a Platform </h3>

                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
                        <XIcon className="size-4" />
                    </button>
                </div>

                {/* Platform List */}
                <div className="p-6 flex flex-col gap-2">
                    {PLATFORMS.map((p) => {
                        const isConnected = connectedIds.includes(p.id);
                        const isConnecting = connecting === p.id;
                        return (
                            <button
                                key={p.id}
                                disabled={isConnected || isConnecting}
                                onClick={() => onConnect(p.id)}
                                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${isConnected ? "border-red-200 bg-red-50 cursor-default" : isConnecting ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 hover:border-slate-300 hover:bg-slate-100 cursor-pointer" }`}>
                                {/* Icon */}
                                <div className="p-2">
                                    <p.icon className={`size-5 ${isConnected ? "text-red-600" : "text-slate-500"}`} />
                                </div>

                                {/* Label */}
                                <div className="flex-1 min-w-0">
                                    <div className={`text-sm ${isConnected ? "text-slate-800" : "text-red-700"}`}>
                                        {p.name}
                                    </div>
                                    <div className="text-sm text-slate-500 truncate">
                                        {isConnected ? "Already Connected" : p.description}
                                    </div>
                                </div>

                                {/* Status */}
                                {isConnected && (<CheckCircleIcon className="size-4 text-red-500 shrink-0" />)}

                                {!isConnected && !isConnecting && (<ExternalLinkIcon className="size-3.5 shrink-0" />)}

                                {isConnecting && (<div className="size-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin shrink-0" />)}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default PlatformPickerModal;