# Observer – Endringslogg

Alle vesentlige endringer i Observer dokumenteres i denne filen.

Endringsloggen skal gi en rask og forståelig oversikt over hva som er lagt til, endret, rettet eller fjernet mellom versjoner. Den skal ikke brukes som en fullstendig teknisk logg over commits eller mindre kodeendringer.

Observer bruker versjonsnummerering etter formatet:

MAJOR.MINOR.PATCH

Eksempel: 0.4.2

Så lenge Observer er under aktiv utvikling før første stabile utgivelse, brukes versjoner under 1.0.0.

[Under utvikling]

Endringer som er gjort i kodebasen, men som ennå ikke er inkludert i en ferdig versjon.

Lagt til


Endret
Felles UI-elementer er samlet og standardisert.
Gjentakende grensesnittelementer er erstattet med felles komponenter.
Struktur og bruk av UI-komponenter er gjort mer konsekvent på tvers av Observer.
Rettet


Fjernet
Overflødige og utdaterte UI-elementer som ikke lenger er i bruk.
Dupliserte løsninger som er erstattet av standardiserte komponenter.
Teknisk
Pågående opprydding i kodebasen.
Standardisering av prosjektets komponentstruktur.
Forberedelser for tydelig skille mellom utviklings-, test- og produksjonsmiljø.
Kjente problemer
Utviklings-, test- og produksjonsmiljø er ennå ikke ferdig separert.
Retningslinjer for endringsloggen
Lagt til

Brukes for ny funksjonalitet som ikke eksisterte tidligere.

Eksempler:

Lagt til Judge Workspace.
Lagt til støtte for rollebasert navigasjon.
Lagt til tilkoblingsstatus for OBS WebSocket.
Endret

Brukes når eksisterende funksjonalitet eller oppførsel er endret.

Eksempler:

Forbedret Match Selector.
Endret navigasjonen for Producer.
Standardisert knappestiler på tvers av programmet.
Rettet

Brukes for feilrettinger.

Eksempler:

Rettet feil hvor OBS ikke koblet til igjen etter brutt forbindelse.
Rettet feil hvor life total ikke ble nullstilt korrekt.
Fjernet

Brukes når funksjoner, komponenter eller løsninger bevisst er fjernet.

Eksempler:

Fjernet gammel Match Control-komponent.
Fjernet utdaterte testfunksjoner.
Teknisk

Brukes for viktige tekniske endringer som ikke nødvendigvis er synlige for brukeren, men som er relevante for videre utvikling.

Eksempler:

Omstrukturert komponentarkitekturen.
Oppdatert prosjektstrukturen.
Endret håndtering av miljøvariabler.
Forbedret datavalidering.

Ikke alle interne kodeendringer skal føres her. Vanlig kodeopprydding, små refaktoreringer og individuelle commits dokumenteres gjennom Git.

Kjente problemer

Brukes for kjente feil eller begrensninger som følger med en versjon og som det er relevant å kjenne til.

Eksempler:

Automatisk reconnect til OBS fungerer ikke i alle tilfeller.
Melee-integrasjonen er fortsatt under utvikling.
Versjonsformat

Observer bruker:

MAJOR.MINOR.PATCH

MAJOR

Større versjon eller grunnleggende endringer i Observer.

Eksempel:

1.0.0 → 2.0.0

MINOR

Ny funksjonalitet eller en betydelig utvidelse som ikke representerer en helt ny hovedversjon.

Eksempel:

0.4.0 → 0.5.0

PATCH

Feilrettinger og mindre forbedringer uten større funksjonelle endringer.

Eksempel:

0.5.0 → 0.5.1

Release-format

Når en ny versjon publiseres flyttes relevante punkter fra Under utvikling til en egen versjon.

Eksempel:

[0.5.0] – 2026-09-18
Lagt til
Lagt til grunnleggende rolleadministrasjon.
Lagt til System Status.
Endret
Standardisert UI-komponentene.
Forbedret Match Control.
Rettet
Rettet feil ved reconnect til OBS.
Teknisk
Etablert separate utviklings-, test- og produksjonsmiljøer.
Kjente problemer
Melee-integrasjonen er fortsatt under utvikling.
Prinsipper

Endringsloggen skal være:

Kortfattet.
Forståelig for både utviklere og prosjektansvarlige.
Oppdatert ved hver release.
Fokusert på vesentlige endringer.
Knyttet til Observers versjonsnummer.

Git og commits dokumenterer detaljene.

CHANGELOG.md dokumenterer utviklingen av Observer.


-------------------------------------

### RELEASE 0.0.1, 18/09-26

-------------------------------------