"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAssistant } from "../../momo/AssistantProvider";
import { SOCIAL_LINES } from "./lines";
import { CAT_CSS, GhostCat } from "./GhostCat";
import { randomCat } from "./names";

const MAX_REMOTE = 24;
const STALE_MS = 15_000;
const SEND_EVERY_MS = 125; // ~8 msgs/s
const HEARTBEAT_MS = 3_000;
const IDLE_MS = 4_000;
const HIDE_KEY = "visitor-cats-hidden";

type Remote = {
  id: string;
  name: string;
  hue: number;
  x: number; // current, viewport px
  y: number; // current, document px
  tx: number;
  ty: number;
  seen: number;
  moved: number;
  ready: boolean;
  el: HTMLDivElement | null;
};

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/**
