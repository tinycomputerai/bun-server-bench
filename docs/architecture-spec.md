## ROLE

You are a senior benchmark engineer designing a Harbor-compatible benchmark called `bun-bench`.

The purpose of this benchmark is to evaluate coding agents on their ability to build production-quality backend systems using Bun.

This benchmark will eventually be used for:

- Agent evaluation
- Model benchmarking
- Synthetic dataset generation
- Reinforcement learning rollouts
- Fine-tuning tinycomputer.ai models

The benchmark must be difficult to game.

The benchmark must reward correctness rather than style.

The benchmark must be executable entirely through automated tests.

## OBJECTIVE

Create the complete repository structure for a Harbor-compatible benchmark called `bun-bench`.

Do NOT create thousands of tasks.

Instead create the infrastructure required to generate, validate, run, and score tasks.

## REQUIREMENTS

The repository should contain:

```
bun-bench/
├── tasks/
├── generators/
├── schemas/
├── validators/
├── runners/
├── leaderboards/
├── datasets/
├── scripts/
├── docs/
└── examples/
```

Design each directory in detail.

For every directory explain:

- purpose
- files
- ownership
- interfaces
- inputs
- outputs

## TASK FORMAT

Design a canonical task specification.

Every task must contain:

```yaml
id:
title:
description:
difficulty:
category:
tags:
instruction:
success_criteria:
environment:
tests:
timeouts:
reference_solution:
```

Explain every field.

Explain how tasks are validated.

Explain how tasks are versioned.

Explain how tasks evolve over time.

## CATEGORIES

Design benchmark categories.

Include:

- HTTP APIs
- CRUD Systems
- Authentication
- Authorization
- Middleware
- WebSockets
- Background Jobs
- File Uploads
- Validation
- Databases
- Caching
- Observability
- Rate Limiting
- Error Handling
- Testing
- Security

For each category:

- explain why it matters
- example tasks
- scoring implications

## DIFFICULTY SYSTEM

Create a difficulty ladder:

- Level 1
- Level 2
- Level 3
- Level 4
- Level 5

Define:

- expected code size
- expected complexity
- expected architecture
- expected reasoning depth

Provide concrete examples.

## SCORING

Design a scoring system.

Weight:

- correctness
- test pass rate
- latency
- dependency count
- code quality
- security

Explain exact formulas.

## DATASET GENERATION

Design a synthetic task generation system.

The system should be capable of generating thousands of unique tasks without duplicates.

Explain:

- parameterized templates
- mutation strategies
- constraint systems
- diversity guarantees

Provide pseudocode.

## HARBOR INTEGRATION

Assume Harbor is the execution engine.

Design:
- task packaging
- execution lifecycle
- result collection
- leaderboard generation
- rollout export

Provide examples.

## OUTPUT FORMAT

Produce:
1. repository architecture
2. schemas
3. interfaces
4. file layouts
5. examples
6. implementation plan
7. roadmap

## Must adhere

Be extremely detailed.

Assume this repository will eventually become a public benchmark maintained by tinycomputer.ai.