import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { strings } from "@/lib/i18n/sv";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <Link href="/" className="text-xs text-black/50 underline underline-offset-2 dark:text-white/50">
          ← {strings.chat.backToHome}
        </Link>
        <h1 className="text-sm font-semibold">{strings.chat.title}</h1>
        <span className="w-16" aria-hidden />
      </header>
      <div className="min-h-0 flex-1">
        <ChatInterface />
      </div>
    </div>
  );
}
