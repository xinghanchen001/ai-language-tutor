import { Send, Loader2, Sparkles, User } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/types";
import { useRef, useEffect } from "react";

interface ChatInterfaceProps {
    messages: ChatMessage[];
    input: string;
    setInput: (value: string) => void;
    sendMessage: () => void;
    loading: boolean;
    disabled: boolean;
}

export default function ChatInterface({
    messages,
    input,
    setInput,
    sendMessage,
    loading,
    disabled
}: ChatInterfaceProps) {
    const chatBottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll chat
    useEffect(() => {
        if (chatBottomRef.current) {
            chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const hasMessages = messages.length > 0;

    if (disabled && messages.length === 0) return null;

    return (
        <div className={cn(
            "flex flex-col transition-all duration-300",
            hasMessages
                ? "h-[500px] md:h-auto"
                : "h-auto"
        )}>
            {hasMessages && (
                <div className="flex-1 overflow-y-auto py-4 space-y-4 custom-scrollbar">
                    {messages.map((msg, i) => (
                        <div key={i} className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm",
                                msg.role === 'user' ? "bg-blue-600 text-white" : "bg-white text-blue-500 border border-blue-100"
                            )}>
                                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                            </div>
                            <div className={cn(
                                "p-3 rounded-2xl text-sm max-w-[85%] leading-relaxed shadow-sm",
                                msg.role === 'user'
                                    ? "bg-blue-600 text-white rounded-tr-none"
                                    : "bg-white text-slate-700 border border-slate-100 rounded-tl-none prose prose-blue prose-sm max-w-none"
                            )}>
                                {msg.role === 'model' ? <ReactMarkdown>{msg.content}</ReactMarkdown> : msg.content}
                            </div>
                        </div>
                    ))}
                    <div ref={chatBottomRef} />
                </div>
            )}

            <div className={cn(
                "transition-all duration-300",
                hasMessages ? "pt-2 pb-4" : "pt-4"
            )}>
                <div className="relative flex items-end gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={disabled ? "Select a correction to start chatting" : (hasMessages ? "Ask a follow-up question..." : "Ask a follow-up question about the text...")}
                        disabled={disabled}
                        className={cn(
                            "w-full bg-slate-50 border-transparent focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 placeholder:text-slate-400 resize-none transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
                            hasMessages ? "min-h-[50px] max-h-[120px]" : "min-h-[50px] h-[50px]"
                        )}
                        rows={1}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!input.trim() || loading || disabled}
                        className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20 flex-shrink-0"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
