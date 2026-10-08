import { createContext, useCallback, useContext, type PropsWithChildren } from "react";
import { findPlace } from "../data/places";
import { placeCopy, turkishMessages } from "../data/translations";
import type { Place } from "../types";

export type Language = "en" | "tr";
export type PlaceTextField = "description" | "tip" | "entry" | "bestTime";

const LanguageContext = createContext<Language>("en");
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const messages = new Map(
  Object.entries(turkishMessages).map(([english, turkish]) => [normalize(english), turkish]),
);
const dynamicMessages = Object.entries(turkishMessages)
  .filter(([english]) => /\{\w+\}/.test(english))
  .map(([english, turkish]) => {
    const parameters: string[] = [];
    const pattern = normalize(english).split(/(\{\w+\})/).map((part) => {
      if (/^\{\w+\}$/.test(part)) {
        parameters.push(part.slice(1, -1));
        return "(.+?)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    return { pattern: new RegExp(`^${pattern}$`), parameters, turkish };
  });

/** Unknown copy stays readable in English; user-authored notes are never translated. */
export function translate(english: string, language: Language = "en"): string {
  if (language === "en") return english;
  const normalized = normalize(english);
  let translated = messages.get(normalized);
  if (translated === undefined) {
    for (const entry of dynamicMessages) {
      const match = entry.pattern.exec(normalized);
      if (!match) continue;
      translated = entry.turkish.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
        const index = entry.parameters.indexOf(name);
        return index < 0 ? placeholder : match[index + 1];
      });
      break;
    }
  }
  if (translated === undefined) return english;
  const leading = english.match(/^[ \t]+/)?.[0] ?? "";
  const trailing = english.match(/[ \t]+$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

export function LanguageProvider({
  language = "en",
  children,
}: PropsWithChildren<{ language?: Language }>) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): Language {
  return useContext(LanguageContext);
}

export function useTranslation(): (english: string) => string {
  const language = useLanguage();
  return useCallback((english: string) => translate(english, language), [language]);
}

export function translatePlace(
  placeOrId: Place | string,
  language: Language = "en",
  fallback?: string,
): string {
  const place = typeof placeOrId === "string" ? findPlace(placeOrId) : placeOrId;
  const id = typeof placeOrId === "string" ? placeOrId : placeOrId.id;
  const english = fallback ?? place?.name ?? id;
  return language === "tr" ? placeCopy[id]?.name ?? english : english;
}

export function getPlaceText(
  place: Place,
  field: PlaceTextField,
  language: Language = "en",
): string {
  return language === "tr" ? placeCopy[place.id]?.[field] ?? place[field] : place[field];
}
