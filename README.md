# Kalkulator ROI budżetu

Jednoekranowa aplikacja webowa (MVP z PRD, wymagania **F1–F8**): rozpisz roczny budżet na kategorie
i zobacz oczekiwany zwrot z każdej z nich oraz z całości.

## Uruchomienie

```bash
npm start        # http://localhost:8080 (serwer statyczny, bez zależności)
npm test         # testy logiki obliczeń, walidacji i formatowania
```

Wymaga Node.js ≥ 20. Aplikacja to czysty HTML/CSS/JS (moduły ES) — można ją też wrzucić na dowolny hosting statyczny (HTTPS).

## Co jest zrobione

| ID | Wymaganie | Gdzie |
|----|-----------|-------|
| F1 | Roczny budżet (> 0, maks. 2 miejsca, maks. 1 bln), wybór waluty (domyślnie PLN) | `index.html`, `src/calc.js` |
| F2 | Dodawanie kategorii: nazwa (wymagana, unikalna, 1–50 znaków), udział %, ROI %; limit 1–30 | `src/app.js`, `src/calc.js` |
| F3 | Edycja inline, usuwanie z komunikatem „Cofnij” przez 5 s | `src/app.js` |
| F4 | „Rozdzielono X% / pozostało Y%” na żywo, pasek żółty / czerwony / zielony | `src/app.js`, `styles.css` |
| F5 | Kwota, zysk i wartość końcowa per kategoria | `src/calc.js` |
| F6 | Łączna kwota, łączny zysk, ważony ROI portfela, wartość końcowa | `src/calc.js` |
| F7 | Wykres udziału w budżecie (z „Nierozdzielone”) i wykres zysku (obsługa strat) | `src/charts.js` |
| F8 | Autozapis w `localStorage`, bez konta; plan zapisywany jako `complete` tylko przy sumie 100% i braku błędów, inaczej `draft` | `src/storage.js` |

Dodatkowo: Enter w ostatnim wierszu dodaje kategorię, przycisk „Rozdziel resztę”, układ kart na telefonie (od 360 px),
tryb ciemny, etykiety pól i komunikaty błędów pod polami, alternatywa tekstowa wykresów, zastrzeżenie prawne,
zdarzenia analityczne bez kwot (`src/analytics.js` → `window.dataLayer`), teksty w `src/i18n/pl.js` (gotowe pod angielski).

## Obliczenia

Wszystkie obliczenia są dziesiętne (`BigInt` na stałej skali 12 miejsc, `src/decimal.js`) — bez błędów float;
zaokrąglenie tylko przy wyświetlaniu (format pl-PL: przecinek dziesiętny, spacja tysięcy).

```
Kwota_i   = B · u_i / 100
Zysk_i    = Kwota_i · r_i / 100
Wartość_i = Kwota_i + Zysk_i
ROI       = Σ Zysk_i / Σ Kwota_i · 100%
```

Plan jest kompletny, gdy |suma udziałów − 100| < 0,01 pp.

## Założenia wobec otwartych pytań PRD

- ROI liczony prosto za 1 rok (bez kapitalizacji).
- Plan z sumą < 100% zapisuje się jako szkic (`draft`); nierozdzielona część nie jest wliczana do zwrotu.
- Udział podaje się w %, nie w kwocie.
- Jedna wartość ROI (bez wariantów pesymistyczny/optymistyczny).

## Poza MVP

P1/P2 (szablony, wiele scenariuszy, eksport CSV/PDF, konta i synchronizacja, faktyczny ROI) nie są zaimplementowane.
Brak backendu, więc walidacja działa tylko po stronie klienta.
