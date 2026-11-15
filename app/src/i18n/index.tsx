import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { STRINGS } from "./strings";
import type { Lang, StringKey } from "./strings";

/**
 * 语言环境：zh/en 双语（M13-03）。
 * 偏好存 localStorage（每设备各自的语言，不进同步库）；取不到就回中文。
 * 组件里用 `const { lang, setLang, t } = useLang();`，文案一律 t("key")。
 */

const LANG_STORAGE_KEY = "guanfu.lang";

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch {
    /* localStorage 不可用（隐私模式等），回退中文 */
  }
  return "zh";
}

type LangContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** 取当前语言的文案；键不存在编译期就报错 */
  t: (key: StringKey) => string;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang);

  useEffect(() => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* 同上，写不进就只在本会话生效 */
    }
  }, [lang]);

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang: setLangState,
      t: (key) => STRINGS[key][lang],
    }),
    [lang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang 必须在 <LangProvider> 里用");
  return ctx;
}
