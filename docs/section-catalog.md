# Standard section catalog

The section catalog is a table of rolled steel sections.
It holds 50 sections in four series.
Each row stores the nominal dimensions, the mass, and the section properties.
The `section_catalog` tool searches this table.
The `beam_bending` and `section_properties` tools accept a designation from this table.

## Covered range

The catalog covers common sizes of each series.
It does not cover every size in the standard.

| Series | Type | Sizes covered |
| --- | --- | --- |
| IPE | I profile, parallel flanges | IPE 80 to IPE 500 |
| HEA | H profile, wide flanges | HEA 100 to HEA 300 |
| HEB | H profile, wide flanges | HEB 100 to HEB 300 |
| UPN | U profile, tapered flanges | UPN 80 to UPN 300 |

The designations follow the standard series.
IPE steps through 80, 100, 120, 140, 160, 180, 200, 220, 240, 270, 300, 330, 360, 400, 450, and 500.
The other series step through the even numbers in their range.

## Source of the values

The values come from the published tables of EN 10365.
See the entry `en-10365` in `data/references.json` for the full citation.
Every row stores the same reference id.
The `section_catalog` tool returns this reference with each result.

Each property column has a defined source:

| Column | Meaning | Source |
| --- | --- | --- |
| `heightMm` | Overall section height | Nominal dimension in the standard tables |
| `flangeWidthMm` | Overall flange width | Nominal dimension in the standard tables |
| `webThicknessMm` | Web thickness | Nominal dimension in the standard tables |
| `flangeThicknessMm` | Flange thickness | Nominal dimension in the standard tables |
| `areaCm2` | Cross-section area | Published value in the standard tables |
| `massPerMetreKgM` | Mass per unit length | Published value in the standard tables |
| `secondMomentCm4` | Second moment of area about the strong axis | Published value in the standard tables |
| `sectionModulusCm3` | Elastic section modulus about the strong axis | Published value in the standard tables |

Fillets and root radii are included in the published values.
Do not compute the section properties from the nominal plate dimensions alone.

## Audit

Each value was checked against published tables for the standard series.
The audit also applies two consistency rules.

First, the mass must match the area and the steel density.
The density is 7850 kilograms per cubic metre.
The check allows a tolerance of 0.5 percent.
The small deviation comes from the rounded values in the tables.

Second, the section modulus must match the second moment of area.
The relation is `W = I divided by (h divided by 2)`.
The check allows a tolerance of 1 percent.
The small deviation comes from the rounded values in the tables.

The test file `tests/section-data-audit.test.ts` runs these rules.
It also checks the covered range and the uniqueness of the designations.
Run `npm test` to reproduce the audit.

## Data files

The catalog lives in `data/sections.json`.
This file is the single source of truth.
The database seeds from it on first start.
Do not edit the generated SQLite file directly.
Use the same pattern for any new series.
