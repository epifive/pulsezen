import "server-only";
import type { Kysely } from "kysely";
import type { Database } from "./schema";

/** Translations of the default site texts, so the demo's home page is fully translated. */
const SITE_TEXTS: Record<string, Record<string, string>> = {
  ar: {
    "setting.site_tagline": "تحليلات مواقع بسيطة تحترم الخصوصية",
    "setting.home_hero_title": "تحليلات المواقع بدون الجانب المزعج",
    "setting.home_hero_subtitle":
      "تحليلات بسيطة بدون ملفات تعريف الارتباط لكل مواقعك: الزوار والصفحات والمصادر وزيارات الذكاء الاصطناعي والأهداف والإيرادات، مع تقارير بالبريد وتنبيهات الزيارات.",
    "setting.footer_text": "تحليلات مواقع تحترم الخصوصية بدون ملفات تعريف الارتباط.",
    "setting.copyright_text": "© {year} {site_name}. جميع الحقوق محفوظة.",
    "setting.cookie_consent_text": "نستخدم ملفات تعريف الارتباط لإبقائك مسجلًا الدخول ولفهم كيفية استخدام الموقع. باستمرارك في التصفح فإنك توافق على استخدامنا لها.",
  },
  hi: {
    "setting.site_tagline": "आसान और प्राइवेसी-फ़्रेंडली वेबसाइट एनालिटिक्स",
    "setting.home_hero_title": "वेबसाइट एनालिटिक्स, बिना जासूसी के",
    "setting.home_hero_subtitle":
      "आपकी हर वेबसाइट के लिए बिना कुकी वाला आसान एनालिटिक्स: विज़िटर, पेज, सोर्स, AI ट्रैफ़िक, गोल और रेवेन्यू। ईमेल रिपोर्ट और ट्रैफ़िक अलर्ट भी शामिल।",
    "setting.footer_text": "बिना कुकी वाला प्राइवेसी-फ़्रेंडली वेबसाइट एनालिटिक्स।",
    "setting.copyright_text": "© {year} {site_name}. सर्वाधिकार सुरक्षित।",
    "setting.cookie_consent_text": "हम आपको साइन इन रखने और साइट के इस्तेमाल को समझने के लिए कुकी का इस्तेमाल करते हैं। आगे बढ़कर आप कुकी के इस्तेमाल से सहमत होते हैं।",
  },
};

interface LanguagePack {
  language: { code: string; name: string; native_name: string; direction: "ltr" | "rtl" };
  translations: Record<string, string>;
}

/** Install the bundled Hindi and Arabic packs on a demo site (once, guarded by a settings row). */
export async function seedDemoLanguages(db: Kysely<Database>): Promise<void> {
  try {
    await db.insertInto("settings").values({ key: "demo_languages_seeded_at", value: new Date().toISOString() }).execute();
  } catch {
    return;
  }
  const packs = [(await import("../../../languages/hi.json")).default, (await import("../../../languages/ar.json")).default] as LanguagePack[];
  for (const [index, pack] of packs.entries()) {
    const { code, name, native_name, direction } = pack.language;
    const exists = await db.selectFrom("languages").select("code").where("code", "=", code).executeTakeFirst();
    if (exists) continue;
    const rows = Object.entries({ ...pack.translations, ...SITE_TEXTS[code] }).map(([key, value]) => ({ lang: code, key, value }));
    await db.transaction().execute(async (trx) => {
      await trx.insertInto("languages").values({ code, name, native_name, direction, is_active: 1, sort_order: (index + 1) * 10 }).execute();
      for (let i = 0; i < rows.length; i += 200) await trx.insertInto("translations").values(rows.slice(i, i + 200)).execute();
    });
  }
}
