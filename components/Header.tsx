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
    <header className="bg-[#131925] border-b border-[#1e2639] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-blue-500">Shchard</h1>
          <span className="text-sm text-gray-400">OPN Chain</span>
        </div>

        <form onSubmit={handleSearch} className="flex-1 max-w-2xl mx-8">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search token by address or name..."
              className="w-full bg-[#0a0e1a] border border-[#1e2639] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-500 hover:bg-blue-600 px-4 py-1 rounded text-sm"
            >
              Search
            </button>
          </div>
        </form>

        <div className="flex items-center gap-4">
          <button className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-medium">
            Connect Wallet
          </button>
        </div>
      </div>
    </header>
  );
}
