// app/page.tsx — Zora root page
import ChatInterface from "@/components/ChatInterface";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zora — Privacy-First AI Concierge",
  description: "Your privacy-first AI concierge. Voice commands, private notes, and secure contacts.",
};

export default function Home() {
  return (
    <main
      style={{
        width: "100%",
        minHeight: "100dvh",
        backgroundColor: "#09090b",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
      }}
    >
      <ChatInterface />
    </main>
  );
}
