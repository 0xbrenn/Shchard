"use client";

import { useState } from "react";

interface HeaderProps {
  onTokenSelect: (address: string) => void;
}

export default function Header({ onTokenSelect }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onTokenSelect(searchQuery.trim());
    }
  };

  return (
    <header className="glass-strong border-b border-[rgba(236,72,153,0.3)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold gradient-text">Shchard</h1>
          <span className="text-sm text-gray-400">OPN Chain</span>
        </div>

        <form onSubmit={handleSearch} className="flex-1 max-w-2xl mx-8">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search token by address or name..."
              className="w-full glass border border-[rgba(139,92,246,0.3)] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-[#8b5cf6] focus:glow-purple transition-all"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-gradient px-4 py-1 rounded text-sm font-medium glow-pink"
            >
              Search
            </button>
          </div>
        </form>

        <div className="flex items-center gap-4">
          <button className="btn-gradient px-4 py-2 rounded-lg text-sm font-medium card-hover glow-blue">
            Connect Wallet
          </button>
        </div>
      </div>
    </header>
  );
}
