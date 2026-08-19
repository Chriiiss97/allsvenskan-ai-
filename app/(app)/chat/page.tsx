import { ChatInterface } from "@/components/chat/ChatInterface";

// Auth-koll sker redan i app/(app)/layout.tsx. Header/nav kommer nu från
// <Sidebar> (se layouten) istället för en egen sidhuvud här.
export default function ChatPage() {
  return (
    <div className="h-full">
      <ChatInterface />
    </div>
  );
}
