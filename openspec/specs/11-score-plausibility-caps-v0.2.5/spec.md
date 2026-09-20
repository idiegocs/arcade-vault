# 11-score-plausibility-caps-v0.2.5 Specification

## Purpose

Ensures every score persisted to the leaderboard represents an outcome that
game's own scoring rules could actually produce, instead of accepting any
non-negative integer a caller submits directly.

## Requirements

### Requirement: Per-game maximum score enforcement

The system SHALL define a maximum plausible score for each playable game and
SHALL reject any score submission greater than that game's maximum, without
persisting it.

#### Scenario: Score exceeds a game's maximum

- **WHEN** a score submission for a game is greater than that game's
  configured maximum
- **THEN** the system SHALL NOT insert a row into the scores leaderboard and
  SHALL return a failure result

#### Scenario: Score is within a game's maximum

- **WHEN** a score submission for a game is less than or equal to that game's
  configured maximum, and is otherwise valid (a non-negative integer, from an
  authenticated user)
- **THEN** the system SHALL persist the score as it does today

### Requirement: Exact maximum for finite-scoring games

For a game whose scoring is bounded by a fixed, enumerable set of scoring
events (for example, a fixed set of levels each with a fixed set of
destructible objects), the system SHALL set that game's maximum to the exact
total obtainable by triggering every one of those scoring events once,
computed from that game's own scoring rules.

#### Scenario: BLOQUE BUSTER maximum

- **WHEN** a score submission is made for `bloque-buster`
- **THEN** the system SHALL reject any score greater than 2080 (its 5 fixed
  levels contain 208 blocks total, worth 10 points each)

### Requirement: Sanity ceiling for effectively endless games

For a game with no fixed end (its scoring events are not bounded by a finite,
enumerable set — for example infinite waves, infinite pieces, or a score that
keeps accumulating across multiple lives), the system SHALL set that game's
maximum to a fixed ceiling set well beyond any realistic human play session.
This ceiling only rejects clearly fabricated submissions; it does not bound
legitimate long sessions and does not detect moderate score manipulation.

#### Scenario: Endless game score far above any realistic session

- **WHEN** a score submission for `rocas`, `caida`, or `serpentina` is greater
  than that game's configured sanity ceiling (1,000,000 for `rocas`, 1,000,000
  for `caida`, 100,000 for `serpentina`)
- **THEN** the system SHALL reject the submission

### Requirement: Unconfigured games reject all scores

The system SHALL treat a game with no configured maximum score as accepting
no valid score, rejecting every submission for it.

#### Scenario: Score submitted for a game with no configured maximum

- **WHEN** a score submission targets a game that has no maximum score
  configured (for example, a catalog entry with no engine yet)
- **THEN** the system SHALL reject the submission
