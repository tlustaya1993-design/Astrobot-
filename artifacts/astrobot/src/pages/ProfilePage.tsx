import React from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import ProfileSheet from "@/components/profile/ProfileSheet";

export default function ProfilePage() {
  const [, setLocation] = useLocation();

  return (
    <AppLayout>
      <div className="flex flex-1 flex-col min-h-0 w-full">
        <ProfileSheet variant="page" open onClose={() => setLocation("/chat")} />
      </div>
    </AppLayout>
  );
}
