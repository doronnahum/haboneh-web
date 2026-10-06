#!/usr/bin/env python3
"""Build the HaBoneh landing site into landing/dist.

Static, no JS. Hebrew RTL primary with an English column. The legal pages are
generated from the SAME strings the app ships (src/locales/{he,en}.json →
profile.legal.*), so the website and the app never disagree about privacy.

Usage: python3 landing/build.py   (from the repo root)
"""
from __future__ import annotations

import html
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'landing'
DIST = SRC / 'dist'
HE = json.loads((SRC / 'he.json').read_text(encoding='utf-8'))
EN = json.loads((SRC / 'en.json').read_text(encoding='utf-8'))

SUPPORT_EMAIL = HE['profile']['help']['contact']['email_address']
YEAR = 2026


def md_to_html(md: str) -> str:
    """Tiny markdown subset: #/##/### headings, paragraphs, '- ' lists, **bold**."""
    out: list[str] = []
    in_list = False
    for raw in md.split('\n'):
        line = raw.rstrip()
        if not line:
            if in_list:
                out.append('</ul>')
                in_list = False
            continue
        if line.startswith('- '):
            if not in_list:
                out.append('<ul>')
                in_list = True
            out.append(f'<li>{inline(line[2:])}</li>')
            continue
        if in_list:
            out.append('</ul>')
            in_list = False
        m = re.match(r'^(#{1,3})\s+(.*)$', line)
        if m:
            level = len(m.group(1)) + 1  # page h1 is the site title
            out.append(f'<h{level}>{inline(m.group(2))}</h{level}>')
            continue
        out.append(f'<p>{inline(line)}</p>')
    if in_list:
        out.append('</ul>')
    return '\n'.join(out)


def inline(text: str) -> str:
    escaped = html.escape(text, quote=False)
    return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', escaped)


def shell(*, title: str, lang: str, body: str, desc: str, path_depth: int = 0) -> str:
    rtl = lang == 'he'
    rel = '../' * path_depth
    nav_he = (
        f'<a href="{rel}index.html">ראשי</a>'
        f'<a href="{rel}privacy.html">פרטיות</a>'
        f'<a href="{rel}terms.html">תנאי שימוש</a>'
        f'<a href="{rel}accessibility.html">נגישות</a>'
    )
    nav_en = (
        f'<a href="{rel}en/index.html">Home</a>'
        f'<a href="{rel}en/privacy.html">Privacy</a>'
        f'<a href="{rel}en/terms.html">Terms</a>'
    )
    nav = nav_he if rtl else nav_en
    other = (
        f'<a class="lang" href="{rel}en/index.html" lang="en">English</a>'
        if rtl
        else f'<a class="lang" href="{rel}index.html" lang="he">עברית</a>'
    )
    footer_text = (
        f'© {YEAR} הבונה · <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>'
        if rtl
        else f'© {YEAR} HaBoneh · <a href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>'
    )
    return f'''<!doctype html>
<html lang="{lang}" dir="{'rtl' if rtl else 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="theme-color" content="#2D6BEB">
<link rel="icon" href="{rel}assets/icon-256.png">
<link rel="apple-touch-icon" href="{rel}assets/icon-256.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&family=Frank+Ruhl+Libre:wght@700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{rel}styles.css">
</head>
<body>
<a class="skip" href="#main">{'דילוג לתוכן' if rtl else 'Skip to content'}</a>
<header class="top">
  <a class="brand" href="{rel}{'index.html' if rtl else 'en/index.html'}">
    <img src="{rel}assets/icon-256.png" alt="" width="36" height="36">
    <span>{'הבונה' if rtl else 'HaBoneh'}</span>
  </a>
  <nav aria-label="{'ניווט ראשי' if rtl else 'Main'}">{nav}{other}</nav>
</header>
<main id="main">
{body}
</main>
<footer class="foot">
  <p>{footer_text}</p>
  <p class="small">{'האפליקציה בגרסת בטא. התכנים המשפטיים באתר הם טיוטה ויעודכנו לפני ההשקה לציבור.' if rtl else 'The app is in beta. Legal content on this site is a draft and will be updated before public launch.'}</p>
</footer>
</body>
</html>
'''


HOME_HE = f'''
<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">בקרוב ב־App Store ו־Google Play</p>
    <h1>בונים בית פרטי? <br>כל הפרויקט במקום אחד.</h1>
    <p class="lead">תקציב, מסמכים, משימות, ליקויים ואנשי המקצוע — לזוג שבונה ולמפקח שמלווה.
    עם מעקב פעימות מימון, דוחות ביקור חתומים ותיק פיקוח שמחזיק בבית־משפט.</p>
    <div class="cta-row">
      <a class="btn primary" href="mailto:{SUPPORT_EMAIL}?subject=%D7%94%D7%A6%D7%98%D7%A8%D7%A4%D7%95%D7%AA%20%D7%9C%D7%91%D7%98%D7%90">הצטרפות לבטא</a>
      <a class="btn ghost" href="#pros">למפקחים ואנשי מקצוע</a>
    </div>
    <p class="fine">בטא סגורה · ללא עלות למשפחות · הלקוח הראשון למפקח — בחינם</p>
  </div>
  <div class="hero-art" aria-hidden="true">
    <div class="phone">
      <div class="bar"><span></span></div>
      <div class="card gold"><b>פעימה 3 — שלד</b><i>ממתינה לאישור המפקח</i></div>
      <div class="card"><b>ביקור 12.9</b><i>דוח הונפק · 4 ליקויים · 1 דחוף</i></div>
      <div class="card"><b>תקציב</b><i>₪ 1,240,000 מתוך ₪ 1,650,000</i><u style="--w:75%"></u></div>
      <div class="card"><b>משימות השבוע</b><i>אישור חלונות · פגישה עם הקבלן</i></div>
    </div>
  </div>
</section>

<section class="two" id="families">
  <div class="col">
    <h2>לזוגות שבונים</h2>
    <ul class="feats">
      <li><b>תקציב שלא בורח.</b> הוצאות לפי קטגוריה ושלב, תשלומים עתידיים, ופעימות המימון של הבנק על ציר אחד.</li>
      <li><b>תיק מסמכים משותף.</b> היתר, חוזים, תוכניות וחשבוניות — מתויקים, מגובים ונגישים לשני בני הזוג.</li>
      <li><b>ליקויים עם הוכחות.</b> תמונה, מיקום, אחראי ביצוע, ואימות סגירה על ידי המפקח.</li>
      <li><b>החלטות בלי ויכוחים.</b> "איזה ריצוף?" הופך לסקר קצר עם תשובה מתועדת.</li>
    </ul>
  </div>
  <div class="col" id="pros">
    <h2>למפקחי בנייה ואנשי מקצוע</h2>
    <ul class="feats">
      <li><b>דוח ביקור בדקות, לא בשעתיים.</b> ממצאים מקטלוג ליקויים ישראלי עם אסמכתאות ת"י, תמונות מסומנות, חתימת לקוח באתר ו־PDF ממותג.</li>
      <li><b>הכסף נעצר כשצריך.</b> אישור או הקפאה של פעימת מימון מול ליקוי דחוף — והמשפחה רואה למה.</li>
      <li><b>תיק פיקוח שמחזיק.</b> יומן עבודה בלתי ניתן לעריכה לכל לקוח: מה נעשה, מתי, ועל ידי מי.</li>
      <li><b>כל הלקוחות במשרד אחד.</b> מה ממתין היום, מי לא קיבל ביקור, ומה הופק החודש.</li>
    </ul>
    <p><a class="btn primary" href="mailto:{SUPPORT_EMAIL}?subject=%D7%A4%D7%95%D7%A8%D7%98%D7%9C%20%D7%90%D7%A0%D7%A9%D7%99%20%D7%9E%D7%A7%D7%A6%D7%95%D7%A2">דברו איתנו על פורטל אנשי המקצוע</a></p>
  </div>
</section>

<section class="trust">
  <h2>מה שחשוב לדעת</h2>
  <div class="grid3">
    <div><b>פרטיות לפי החוק הישראלי.</b><p>איסוף מינימלי, מחיקה לפי בקשה, ושקיפות מלאה על מה שנשמר. <a href="privacy.html">מדיניות הפרטיות</a>.</p></div>
    <div><b>בלי אימייל וסיסמה.</b><p>כניסה עם קוד SMS בלבד. אין סיסמה שיכולה לדלוף.</p></div>
    <div><b>נגיש.</b><p>האפליקציה והאתר נבנים לתקן ת"י 5568 (WCAG 2.0 AA). <a href="accessibility.html">הצהרת נגישות</a>.</p></div>
  </div>
</section>
'''

HOME_EN = f'''
<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">Coming soon to the App Store and Google Play</p>
    <h1>Building a private home in Israel? <br>Run the whole project from one place.</h1>
    <p class="lead">Budget, documents, tasks, defects and professionals — for the couple that builds and the inspector who supervises. Financing-milestone tracking, signed site-visit reports and a court-grade supervision file.</p>
    <div class="cta-row">
      <a class="btn primary" href="mailto:{SUPPORT_EMAIL}?subject=Beta%20access">Join the beta</a>
      <a class="btn ghost" href="#pros">For inspectors</a>
    </div>
    <p class="fine">Closed beta · free for families · an inspector's first client is free</p>
  </div>
</section>
<section class="two">
  <div class="col">
    <h2>For couples</h2>
    <ul class="feats">
      <li><b>A budget that stays put.</b> Expenses by category and stage, upcoming payments and the bank's financing milestones on one timeline.</li>
      <li><b>One shared document file.</b> Permit, contracts, plans and invoices — filed, backed up, visible to both partners.</li>
      <li><b>Defects with evidence.</b> Photo, location, responsible trade, and closure verified by your inspector.</li>
      <li><b>Decisions without arguments.</b> "Which tiles?" becomes a short survey with a recorded answer.</li>
    </ul>
  </div>
  <div class="col" id="pros">
    <h2>For building inspectors</h2>
    <ul class="feats">
      <li><b>A visit report in minutes.</b> Findings from an Israeli defect catalog with standards citations, annotated photos, on-site client signature and a branded PDF.</li>
      <li><b>Stop the money when it matters.</b> Approve or freeze a financing milestone against an urgent defect — and the family sees why.</li>
      <li><b>A supervision file that holds up.</b> An append-only work journal per client: what was done, when, by whom.</li>
      <li><b>Every client in one office.</b> What is waiting today, who has no visit booked, what was issued this month.</li>
    </ul>
  </div>
</section>
'''


def legal_page(locale: str, key: str, title: str) -> str:
    bundle = HE if locale == 'he' else EN
    content = bundle['profile']['legal'][key]
    body = f'<article class="prose"><h1>{html.escape(title)}</h1>\n{md_to_html(content)}</article>'
    return body


ACCESSIBILITY_HE = f'''
<article class="prose">
<h1>הצהרת נגישות</h1>
<p>הבונה מחויבת להנגשת האפליקציה והאתר לאנשים עם מוגבלות, בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג־2013, ולתקן הישראלי ת"י 5568 המבוסס על WCAG 2.0 ברמה AA.</p>
<h2>מה נעשה</h2>
<ul>
<li>האתר נבנה כ־HTML סמנטי, ללא JavaScript, עם ניווט מקלדת מלא וקישור "דילוג לתוכן".</li>
<li>ניגודיות צבעים ברמה AA לפחות לטקסט ולרכיבי הממשק.</li>
<li>האפליקציה נבדקת עם VoiceOver ו־TalkBack בעברית ובאנגלית לפני כל גרסה ציבורית.</li>
<li>תוויות נגישות לכל רכיב אינטראקטיבי, וסדר מיקוד לפי כיוון הקריאה.</li>
</ul>
<h2>מה עדיין בעבודה</h2>
<p>האפליקציה בגרסת בטא. בדיקת קורא־מסך מלאה בארבעת התאים (VoiceOver/TalkBack × עברית/אנגלית) תושלם לפני ההשקה לציבור, והצהרה זו תעודכן בהתאם.</p>
<h2>פנייה בנושא נגישות</h2>
<p>נתקלתם בבעיה? כתבו לנו ל־<a href="mailto:{SUPPORT_EMAIL}?subject=%D7%A0%D7%92%D7%99%D7%A9%D7%95%D7%AA">{SUPPORT_EMAIL}</a> ונחזור אליכם תוך 7 ימי עסקים.</p>
<p class="small">עדכון אחרון: אוקטובר {YEAR}.</p>
</article>
'''


def build() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / 'en').mkdir(parents=True)
    shutil.copytree(SRC / 'assets', DIST / 'assets')
    shutil.copy(SRC / 'styles.css', DIST / 'styles.css')
    pages = {
        'index.html': shell(title='הבונה — לבנות בית, בלי לאבד את הראש', lang='he', body=HOME_HE,
                            desc='אפליקציה לזוגות שבונים בית פרטי ולמפקחי הבנייה שמלווים אותם: תקציב, מסמכים, ליקויים, פעימות מימון ודוחות ביקור.'),
        'privacy.html': shell(title='מדיניות פרטיות — הבונה', lang='he', body=legal_page('he', 'privacy_content', 'מדיניות פרטיות'), desc='מדיניות הפרטיות של אפליקציית הבונה.'),
        'terms.html': shell(title='תנאי שימוש — הבונה', lang='he', body=legal_page('he', 'terms_content', 'תנאי שימוש'), desc='תנאי השימוש של אפליקציית הבונה.'),
        'accessibility.html': shell(title='הצהרת נגישות — הבונה', lang='he', body=ACCESSIBILITY_HE, desc='הצהרת הנגישות של הבונה לפי ת"י 5568.'),
        'en/index.html': shell(title='HaBoneh — build a home without losing your mind', lang='en', body=HOME_EN, path_depth=1,
                               desc='The app for couples building a private home in Israel and the inspectors who supervise them.'),
        'en/privacy.html': shell(title='Privacy Policy — HaBoneh', lang='en', body=legal_page('en', 'privacy_content', 'Privacy Policy'), path_depth=1, desc='HaBoneh privacy policy.'),
        'en/terms.html': shell(title='Terms of Use — HaBoneh', lang='en', body=legal_page('en', 'terms_content', 'Terms of Use'), path_depth=1, desc='HaBoneh terms of use.'),
    }
    for name, content in pages.items():
        (DIST / name).write_text(content, encoding='utf-8')
    (DIST / 'robots.txt').write_text('User-agent: *\nAllow: /\n', encoding='utf-8')
    print(f'built {len(pages)} pages → {DIST}')


if __name__ == '__main__':
    build()
