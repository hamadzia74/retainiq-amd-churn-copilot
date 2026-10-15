import { ArrowDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useAutoScroll } from "../../hooks/useAutoScroll";
import type { ChatMessage as Message } from "../../hooks/useChat";
import { fadeUp } from "../../motion/variants";
import { ChatMessage } from "./ChatMessage";

/**
 * The only scrolling part of the Copilot. Follows new messages while the reader is at the
 * bottom; if they scroll up, it stops and offers "Jump to latest".
 */
export function MessageList({ messages, empty }: { messages: Message[]; empty: ReactNode }) {
  const { ref, atBottom, onScroll, scrollToBottom } = useAutoScroll<HTMLDivElement>(messages);

  return (
    <div data-tour="message-list" className="relative min-h-0 flex-1">
      <div ref={ref} onScroll={onScroll} className="absolute inset-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        {messages.length === 0 ? empty : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <motion.div key={i} variants={fadeUp} initial="hidden" animate="show">
                <ChatMessage message={m} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {!atBottom && (
          <motion.button type="button" variants={fadeUp} initial="hidden" animate="show" exit="exit"
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-medium text-fg shadow-lg hover:bg-hover">
            <ArrowDown size={13} strokeWidth={2} /> Jump to latest
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
