import { MapPin, Users, Shield, Globe, MoreHorizontal, MessageSquare, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function FriendDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    
    // Mock Data: 実際にはIDに基づいてデータを取得します
    const friend = {
        id: id,
        name: "Alice",
        status: "online",
        statusMessage: "Exploring new worlds!",
        icon: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alice",
        banner: "https://placehold.co/1200x400/1e293b/6366f1.png?text=Alice's+Banner",
        trust: "Trusted",
        bio: "VRChat photographer and world hopper. Feel free to join!",
        location: {
            worldName: "Midnight Rooftop",
            worldThumb: "https://placehold.co/600x400/1e293b/indigo.png?text=Rooftop",
            instanceType: "Friends+",
            region: "US",
            instanceId: "89324",
            author: "Mochie"
        },
        with: [
            { name: "Bob_VRC", icon: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bob" },
            { name: "Charlie", icon: "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie" },
            { name: "Fox", icon: "https://api.dicebear.com/7.x/avataaars/svg?seed=Fox" },
        ]
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Back Button */}
            <Link href="/friends" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Friends
            </Link>

            {/* Profile Header */}
            <div className="relative rounded-2xl overflow-hidden glass-card group">
                <div className="h-48 bg-slate-800 relative">
                    <img src={friend.banner} alt="Banner" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent opacity-80"></div>
                </div>

                <div className="px-6 pb-6 relative -mt-16 flex flex-col md:flex-row items-start md:items-end gap-6">
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full border-4 border-[#0f172a] bg-slate-800 overflow-hidden">
                            <img src={friend.icon} alt={friend.name} className="w-full h-full object-cover" />
                        </div>
                        <div className={`absolute bottom-2 right-2 w-6 h-6 rounded-full border-4 border-[#0f172a] ${friend.status === 'online' ? 'bg-green-500' : 'bg-slate-500'
                            }`}></div>
                    </div>

                    <div className="flex-1 mb-2">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-white">{friend.name}</h1>
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-wider">
                                {friend.trust}
                            </span>
                        </div>
                        <p className="text-slate-300 mt-1">{friend.statusMessage}</p>
                    </div>

                    <div className="flex gap-3 mb-2 w-full md:w-auto">
                        <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
                            Join
                        </button>
                        <button className="flex items-center justify-center p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors">
                            <MessageSquare className="w-5 h-5" />
                        </button>
                        <button className="flex items-center justify-center p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors">
                            <MoreHorizontal className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Current Location */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card p-6 rounded-2xl">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-indigo-400" /> Current World
                        </h3>
                        <div className="group relative rounded-xl overflow-hidden aspect-video bg-slate-800 mb-4">
                            <img src={friend.location.worldThumb} alt={friend.location.worldName} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-1">{friend.location.worldName}</h2>
                                    <p className="text-sm text-slate-300">by {friend.location.author}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-xs text-slate-400 uppercase">Instance</p>
                                <p className="text-white font-medium mt-1">{friend.location.instanceType} #{friend.location.instanceId}</p>
                            </div>
                            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-xs text-slate-400 uppercase">Region</p>
                                <p className="text-white font-medium mt-1 flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-slate-400" /> {friend.location.region}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: People in Instance */}
                <div className="space-y-6">
                    <div className="glass-card p-6 rounded-2xl h-full">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-green-400" /> With ({friend.with.length})
                        </h3>
                        <p className="text-sm text-slate-400 mb-6">
                            Other friends currently in this instance.
                        </p>

                        <div className="space-y-4">
                            {friend.with.map((user, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                                    <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden">
                                        <img src={user.icon} alt={user.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">{user.name}</p>
                                        <p className="text-xs text-green-400">In World</p>
                                    </div>
                                </div>
                            ))}

                            <button className="w-full py-3 mt-4 text-sm font-medium text-slate-400 hover:text-white border border-dashed border-slate-600 hover:border-slate-400 rounded-xl transition-all">
                                + 2 others hidden
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
