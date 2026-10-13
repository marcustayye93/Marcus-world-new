/*
 * DialogBox — RPG-style dialog box with typewriter text
 * Design: Classic JRPG text box with pixel borders
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

interface DialogBoxProps {
  message: string;
  onNext: () => void;
  onDismiss: () => void;
  isLast: boolean;
}

export default function DialogBox({ message, onNext, onDismiss, isLast }: DialogBoxProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    setDisplayedText("");
    setIsTyping(true);
    let index = 0;
    const interval = setInterval(() => {
      if (index < message.length) {
        setDisplayedText(message.slice(0, index + 1));
        index++;
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [message]);

  const handleClick = () => {
    if (isTyping) {
      setDisplayedText(message);
      setIsTyping(false);
    } else if (isLast) {
      onDismiss();
    } else {
      onNext();
    }
  };

  return (
    <motion.div
      className="fixed bottom-20 sm:bottom-8 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-xl"
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 50, opacity: 0 }}
      transition={{ type: "spring", damping: 20 }}
    >
      {/* Explicit dismiss — always visible, including mid-typing */}
      <button
        aria-label="Dismiss dialogue"
        onClick={onDismiss}
        className="absolute -top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md transition-transform hover:scale-105 active:scale-95"
        style={{ background: "var(--color-zone-dfs)", border: "2px solid #1B5E20" }}
      >
        <X size={14} />
      </button>
      <button
        aria-label={isLast ? 'Close dialogue' : isTyping ? 'Skip typing animation' : 'Next dialogue'}
        onClick={handleClick}
        className="w-full text-left rpg-box rounded-xl p-4 sm:p-5 relative"
      >
        {/* Speaker name */}
        <div
          className="absolute -top-3 left-4 px-3 py-1 rounded-md"
          style={{
            background: "var(--color-zone-dfs)",
            border: "2px solid #1B5E20",
            boxShadow: "2px 2px 0 rgba(0,0,0,0.2)",
          }}
        >
          <span className="pixel-text text-[7px] text-white">MARCUS</span>
        </div>

        {/* Text */}
        <p className="text-sm sm:text-base leading-relaxed mt-1" style={{ fontFamily: "'Nunito', sans-serif", color: "var(--color-rpg-shadow)" }}>
          {displayedText}
          {isTyping && (
            <span className="inline-block w-2 h-4 bg-gray-700 ml-0.5 animate-pulse" />
          )}
        </p>

        {/* Continue prompt */}
        {!isTyping && (
          <motion.div
            className="absolute bottom-2 right-3"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <span className="pixel-text text-[7px] text-gray-400">
              {isLast ? "CLOSE ✕" : "NEXT ▶"}
            </span>
          </motion.div>
        )}
      </button>
    </motion.div>
  );
}
