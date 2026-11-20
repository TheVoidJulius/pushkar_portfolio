"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/admin/api";
import { MomoHead } from "../momo/MomoHead";

export function NotAuthorized({ email }: { email: string }) {
  const router = useRouter();
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <MomoHead expression="confused" className="mx-auto size-40" />
        <h1 className="mt-2 font-display text-[30px]">This account can&apos;t edit the site</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          You&apos;re signed in as <strong>{email}</strong>, but only the site owner has access. If this is you, follow
          “Create the owner account” in the README to grant access.
        </p>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/admin/login");
            router.refresh();
          }}
          className="mt-6 h-11 rounded-full bg-ink px-6 text-bg"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
