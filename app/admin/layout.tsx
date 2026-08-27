"use client";

import { useEffect } from "react";
import { ADMIN_SESSION_KEY, loadExamAdmin } from "@/lib/admin";

const EDIT_SET_KEY = "skillquest-edit-set-id";

export default function AdminAreaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    async function enhanceAdmin() {
      const token = sessionStorage.getItem(ADMIN_SESSION_KEY) ?? "";
      if (!token) return;

      try {
        const data = await loadExamAdmin(token);
        if (stopped) return;

        const path = window.location.pathname.replace(/\/+$/, "");
        const isEditor = path.endsWith("/admin/edit");

        if (!isEditor) {
          const attachButtons = () => {
            const rows = Array.from(document.querySelectorAll<HTMLElement>(".admin-set-list article"));
            if (!rows.length) return false;

            rows.slice(0, Math.min(rows.length, data.sets.length)).forEach((row, index) => {
              if (row.querySelector(".admin-inline-edit")) return;
              const set = data.sets[index];
              if (!set) return;

              row.style.gridTemplateColumns = "38px minmax(0, 1fr) auto auto";

              const button = document.createElement("button");
              button.type = "button";
              button.className = "admin-secondary admin-inline-edit";
              button.textContent = "ดู / แก้ไข";
              button.setAttribute("aria-label", `ดูและแก้ไข ${set.Category}`);
              Object.assign(button.style, {
                minHeight: "34px",
                padding: "0 12px",
                whiteSpace: "nowrap",
              });
              button.addEventListener("click", () => {
                sessionStorage.setItem(EDIT_SET_KEY, set.CategoryID);
                window.location.assign("./edit/");
              });
              row.appendChild(button);
            });
            return true;
          };

          if (!attachButtons()) {
            timer = window.setInterval(() => {
              if (attachButtons() && timer) window.clearInterval(timer);
            }, 120);
          }
          return;
        }

        const requestedId = sessionStorage.getItem(EDIT_SET_KEY) ?? "";
        if (!requestedId) return;
        const setIndex = data.sets.findIndex((item) => item.CategoryID === requestedId);
        if (setIndex < 0) return;

        let attempts = 0;
        timer = window.setInterval(() => {
          attempts += 1;
          const rows = Array.from(document.querySelectorAll<HTMLElement>(".admin-set-list article"));
          const row = rows[setIndex];
          const openButton = row?.querySelector<HTMLButtonElement>("button.admin-secondary");
          if (!openButton) {
            if (attempts > 60 && timer) window.clearInterval(timer);
            return;
          }

          openButton.click();
          const picker = row.closest("section.admin-panel") as HTMLElement | null;
          if (picker) picker.style.display = "none";
          if (timer) window.clearInterval(timer);
        }, 120);
      } catch {
        // The page itself owns authentication/error UI. This enhancer must never
        // interfere with the existing admin flow if bootstrap is unavailable.
      }
    }

    void enhanceAdmin();
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return children;
}
