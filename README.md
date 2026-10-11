# Kalkulator ROI budżetu

Jednoekranowa aplikacja webowa (MVP z PRD, wymagania **F1–F8**): rozpisz roczny budżet na kategorie
i zobacz oczekiwany zwrot z każdej z nich oraz z całości.

## Uruchomienie

Otwórz `index.html` w przeglądarce (dwuklik) — bez serwera, instalacji i narzędzi budowania.
Można też wrzucić trzy pliki na dowolny hosting statyczny (HTTPS).

| Plik | Zawartość |
|------|-----------|
| `index.html` | struktura strony i style (w `<style>`) |
| `app.js` | cała logika: arytmetyka dziesiętna, walidacja, formatowanie, zapis, wykresy, interfejs |
| `i18n-pl.js` | teksty interfejsu po polsku (pod kolejny język wystarczy kopia pliku) |

## Co jest zrobione

| ID | Wymaganie |
|----|-----------|
| F1 | Roczny budżet (> 0, maks. 2 miejsca, maks. 1 bln), wybór waluty (domyślnie PLN) |
| F2 | Dodawanie kategorii: nazwa (wymagana, unikalna, 1–50 znaków), udział %, ROI %; limit 1–30 |
| F3 | Edycja inline, usuwanie z komunikatem „Cofnij” przez 5 s |
| F4 | „Rozdzielono X% / pozostało Y%” na żywo, pasek żółty / czerwony / zielony |
| F5 | Kwota, zysk i wartość końcowa per kategoria |
| F6 | Łączna kwota, łączny zysk, ważony ROI portfela, wartość końcowa |
| F7 | Wykres udziału w budżecie (z „Nierozdzielone”) i wykres zysku (obsługa strat) |
| F8 | Autozapis w `localStorage`, bez konta; plan zapisywany jako `complete` tylko przy sumie 100% i braku błędów, inaczej `draft` |

Dodatkowo: Enter w ostatnim wierszu dodaje kategorię, przycisk „Rozdziel resztę”, układ kart na telefonie (od 360 px),
tryb ciemny, etykiety pól i komunikaty błędów pod polami, alternatywa tekstowa wykresów, zastrzeżenie prawne,
zdarzenia analityczne bez kwot (`window.dataLayer`), teksty w `i18n-pl.js` (gotowe pod angielski).

## Obliczenia

Wszystkie obliczenia są dziesiętne (`BigInt` na stałej skali 12 miejsc) — bez błędów float;
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
