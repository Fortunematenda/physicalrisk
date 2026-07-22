"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";

import TopNavigation from "./TopNavigation";
import { ssoLogout } from "@/lib/sso";

interface ApplicationShellProps {
  children: ReactNode;
}

export default function ApplicationShell({
  children,
}: ApplicationShellProps) {
  const router = useRouter();

  return (
    <>
      <TopNavigation
        organisationName="Physical Risk Consultancy"
        userName="Administrator"
        userEmail="admin@physicalrisk.com"
        unreadNotifications={0}
        onHelpClick={() => {
          router.push("/settings");
        }}
        onNotificationsClick={() => {
          router.push("/imports/logs");
        }}
        onLogout={() => {
          void ssoLogout();
        }}
      />

      <main>{children}</main>
    </>
  );
}
