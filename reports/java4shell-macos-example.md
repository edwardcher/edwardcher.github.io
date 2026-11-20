# Java4Shell — Cross-platform Exposure Inventory
**Assessment time (UTC):** 2026-11-20T10:17:51.587559+00:00
**Decision status:** Inventory only; exploitability not assessed

## Executive summary
Host: **Darwin 27.2.0 (arm64)**. CPU applicability: **NOT_APPLICABLE_TO_X86_PATH**. 
The check does not determine whether the selected Java runtime is vulnerable.

## Evidence
- CPU evidence source: sysctl machdep.cpu.features
- CPU prerequisites observed: none / unavailable
- Java executable: `/usr/bin/java`
- Java version output:
```text
openjdk version "21.0.3" 2024-04-16 LTS
OpenJDK Runtime Environment Temurin-21.0.3+9 (build 21.0.3+9-LTS)
OpenJDK 64-Bit Server VM Temurin-21.0.3+9 (build 21.0.3+9-LTS, mixed mode)
```
- Relevant JVM flags:
```text
not available
```

## Identity and business risk
If a vulnerable JVM is reachable through attacker-controlled Base64 processing, application compromise could expose accessible workload credentials or tokens. This is a conditional scenario, not an observed incident.

## Recommended actions
- Inventory running JVMs and containers on the actual deployment hosts.
- Verify exact vendor build against the applicable security advisory.
- Review attacker-controlled Base64 decoding paths and workload identity permissions.
- Patch and restart affected runtimes, then retest and record evidence.

## Limitations
- CPU instruction support is not proof of exploitability or vulnerability.
- Windows CPU prerequisites remain UNKNOWN on x86 without a reliable OS-specific CPUID/OS-state helper.
- This inspects one selected Java executable; containerized, embedded and other JVMs are not enumerated.
- Version output alone does not establish vendor-specific patch status.
- No exploitation, network probing, or credential access was performed.
