import { ChatInterface } from "@/components/chat/ChatInterface";

// Auth-koll sker redan i app/(app)/layout.tsx. Header/nav kommer nu från
// <Sidebar> (se layouten) istället för en egen sidhuvud här.
//
// Höjden sätts mot vyporten, inte med h-full: <main> i app/(app)/layout.tsx
// ligger i en `min-h-screen`-container och får därför sin höjd FRÅN
// innehållet. Med h-full växte alltså hela sidan när ett svar blev långt,
// och då scrollade både rubrikraden och skrivfältet bort — precis det en
// chatt inte får göra. Med en fast vyporthöjd + overflow-hidden scrollar
// bara meddelandelistan inuti ChatInterface.
//
// Desktop: sidomenyn ligger BREDVID, så hela vyporthöjden är chattens.
// Mobil: <Sidebar> ligger som en topplist ovanför (45px = py-2 + länkhöjd +
// 1px kant, se components/nav/Sidebar.tsx) och måste räknas bort.
export default function ChatPage() {
  return (
    <div className="h-[calc(100svh-45px)] overflow-hidden sm:h-svh">
      <ChatInterface />
    </div>
  );
}
