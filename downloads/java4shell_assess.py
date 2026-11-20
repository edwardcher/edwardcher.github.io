#!/usr/bin/env python3
"""Read-only Java runtime/CPU inventory. No exploit or network activity."""
import argparse
import datetime as dt
import json
import os
import pathlib
import platform
import re
import shutil
import subprocess
import sys

NEEDED = {'avx512f', 'avx512bw', 'avx512vbmi', 'bmi2'}

def run(args, timeout=8):
    try:
        p = subprocess.run(args, capture_output=True, text=True, errors='replace', timeout=timeout, check=False)
        return (p.stdout + '\n' + p.stderr).strip()[:8000]
    except (OSError, subprocess.TimeoutExpired) as e:
        return 'unavailable: ' + str(e)

def normalize_flags(text):
    tokens = set(re.findall(r'[a-zA-Z0-9_]+', text.lower()))
    aliases = {'avx512_vbmi': 'avx512vbmi', 'avx512_bw': 'avx512bw', 'avx512_f': 'avx512f'}
    return {aliases.get(t, t) for t in tokens}

def detect_cpu(system, arch):
    evidence = []
    flags = set()
    if system == 'Linux':
        path = pathlib.Path('/proc/cpuinfo')
        if path.exists():
            text = path.read_text(errors='replace')
            match = re.search(r'^(?:flags|Features)\s*:\s*(.*)$', text, re.M)
            if match:
                flags = normalize_flags(match.group(1))
                evidence.append('/proc/cpuinfo')
        if not flags and shutil.which('lscpu'):
            out = run(['lscpu'])
            match = re.search(r'^(?:Flags|Features):\s*(.*)$', out, re.M)
            if match:
                flags = normalize_flags(match.group(1))
                evidence.append('lscpu')
    elif system == 'Darwin':
        for key in ('machdep.cpu.features', 'machdep.cpu.leaf7_features'):
            out = run(['sysctl', '-n', key])
            if not out.startswith('unavailable:') and 'unknown oid' not in out.lower():
                flags |= normalize_flags(out)
                evidence.append('sysctl ' + key)
    elif system == 'Windows':
        # Windows does not expose a complete AVX-512 feature inventory through Python stdlib.
        # Avoid treating the processor name or Windows CPU feature booleans as AVX-512 proof.
        evidence.append('Windows stdlib: AVX-512 feature detection unavailable')
    is_x86 = arch.lower() in {'x86_64', 'amd64', 'x64', 'i386', 'i686', 'x86'}
    if not is_x86:
        return 'NOT_APPLICABLE_TO_X86_PATH', sorted(flags & NEEDED), evidence
    if NEEDED.issubset(flags):
        status = 'PREREQUISITES_DETECTED'
    elif flags:
        status = 'NOT_DETECTED'
    else:
        status = 'UNKNOWN'
    return status, sorted(flags & NEEDED), evidence

def evaluate(cpu_status, java_exe, java_version):
    """Assess only the documented x86 CPU prerequisite, not application exploitability."""
    if not java_exe or java_version.startswith('unavailable:') or java_version == 'java not found on PATH':
        return ('INCOMPLETE', 'Java runtime could not be inspected', 'Inspect the Java executable used by the actual service.')
    if cpu_status == 'NOT_APPLICABLE_TO_X86_PATH':
        return ('X86_PATH_EXCLUDED', 'Assessed x86-specific CPU path not applicable', 'Other application and JVM security issues are not ruled out.')
    if cpu_status == 'NOT_DETECTED':
        return ('X86_PREREQUISITES_NOT_FOUND', 'Required x86 CPU features not all observed', 'Confirm CPU features on the actual deployment host.')
    if cpu_status == 'PREREQUISITES_DETECTED':
        return ('REQUIRES_REVIEW', 'Required x86 CPU features observed', 'Check vendor advisory, actual JVM build, application reachability and mitigation.')
    return ('INDETERMINATE', 'CPU prerequisite evidence unavailable', 'Collect reliable host CPU feature evidence.')

def main():
    parser = argparse.ArgumentParser(description='Cross-platform Java4Shell local exposure inventory')
    parser.add_argument('--out', default='java4shell-report', help='Markdown/JSON output prefix')
    parser.add_argument('--java', default='java', help='Java executable to inspect (default: PATH)')
    args = parser.parse_args()
    system, arch = platform.system(), platform.machine()
    cpu_status, detected, evidence = detect_cpu(system, arch)
    java_exe = shutil.which(args.java) if args.java == 'java' else args.java
    java_version = run([java_exe, '-version']) if java_exe else 'java not found on PATH'
    java_flags = run([java_exe, '-XX:+PrintFlagsFinal', '-version']) if java_exe else ''
    relevant = [line.strip() for line in java_flags.splitlines() if re.search(r'UseBASE64Intrinsics|UseAVX\s', line)]
    finding, conclusion, followup = evaluate(cpu_status, java_exe, java_version)
    probe_path = pathlib.Path(__file__).with_name('Java4ShellRuntimeProbe.java')
    probe_output = run([java_exe, str(probe_path)], timeout=20) if java_exe and probe_path.exists() else 'unavailable: Java executable or probe source missing'
    probe = dict(re.findall(r'^([A-Za-z0-9_]+)=(.*)$', probe_output, re.M))
    live = probe.get('PROBE') == 'LIVE_JVM_READ_ONLY' and probe.get('BENIGN_BASE64') == 'PASS'
    vm_arch = probe.get('OS_ARCH', '').lower()
    if live and vm_arch in ('aarch64', 'arm64'):
        runtime_finding = 'NOT_AFFECTED_ARCHITECTURE'
    elif live and probe.get('FLAG_UseBASE64Intrinsics') == 'false':
        runtime_finding = 'BASE64_INTRINSIC_DISABLED'
    elif live and probe.get('FLAG_UseAVX', '').isdigit() and int(probe['FLAG_UseAVX']) <= 2:
        runtime_finding = 'AVX512_DISABLED'
    elif live and cpu_status == 'PREREQUISITES_DETECTED':
        runtime_finding = 'REVIEW_VENDOR_PATCH_AND_REACHABILITY'
    elif live and cpu_status == 'NOT_DETECTED':
        runtime_finding = 'CPU_PREREQUISITES_NOT_OBSERVED'
    else:
        runtime_finding = 'INDETERMINATE'

    data = {
        'cve': 'CVE-2026-114938',
        'timestamp_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'platform': {'system': system, 'release': platform.release(), 'version': platform.version(), 'architecture': arch, 'python': sys.version.split()[0]},
        'cpu_prerequisite': cpu_status,
        'required_cpu_flags': sorted(NEEDED),
        'observed_cpu_flags': detected,
        'cpu_evidence': evidence,
        'java_executable': str(java_exe) if java_exe else None,
        'java_version_output': java_version,
        'jvm_flag_observations': relevant,
        'live_jvm_probe': {'executed': live, 'finding': runtime_finding, 'values': probe, 'raw_output': probe_output},
        'assessment': 'LOCAL_PREREQUISITE_TRIAGE',
        'finding': finding,
        'conclusion': conclusion,
        'follow_up': followup,
        'application_exploitability': 'NOT_TESTED',
        'limitations': [
            'CPU instruction support is not proof of exploitability or vulnerability.',
            'Windows CPU prerequisites remain UNKNOWN on x86 without a reliable OS-specific CPUID/OS-state helper.',
            'This inspects one selected Java executable; containerized, embedded and other JVMs are not enumerated.',
            'Version output alone does not establish vendor-specific patch status.',
            'No exploitation, malformed CVE trigger, network probing, or credential access was performed.',
            'A benign Base64 decode is a runtime smoke test, not proof that the vulnerable code path is absent.',
            'The live probe requires Java 11+ source-file launch support and access to the companion .java file.'
        ],
        'next_actions': [
            'Inventory running JVMs and containers on the actual deployment hosts.',
            'Verify exact vendor build against the applicable security advisory.',
            'Review attacker-controlled Base64 decoding paths and workload identity permissions.',
            'Patch and restart affected runtimes, then retest and record evidence.'
        ]
    }
    prefix = pathlib.Path(args.out)
    prefix.parent.mkdir(parents=True, exist_ok=True)
    prefix.with_suffix('.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    md = [
        '# Java4Shell — Cross-platform Exposure Inventory',
        f"**Assessment time (UTC):** {data['timestamp_utc']}",
        f"**Decision status:** {conclusion}",
        '**Application exploitability:** Not tested',
        '', '## Executive summary',
        f"**Host:** {system} {platform.release()} ({arch})  ",
        f"**CPU applicability:** {cpu_status}  ",
        '**Assessment scope:** Local CPU prerequisite and selected Java runtime only',
        f'**Next step:** {followup}',
        'The check does not determine whether the selected Java runtime is vulnerable.',
        '', '## Evidence',
        f"- CPU evidence source: {', '.join(evidence) or 'none'}",
        f"- CPU prerequisites observed: {', '.join(detected) or 'none / unavailable'}",
        f"- Java executable: `{java_exe or 'not found'}`",
        '- Java version output:', '```text', java_version, '```',
        f'- Live JVM probe finding: **{runtime_finding}**',
        '- Live JVM probe output:', '```text', probe_output, '```',
        '- Relevant JVM flags:', '```text', '\n'.join(relevant) or 'not available', '```',
        '', '## Identity and business risk',
        'If a vulnerable JVM is reachable through attacker-controlled Base64 processing, application compromise could expose accessible workload credentials or tokens. This is a conditional scenario, not an observed incident.',
        '', '## Recommended actions',
    ] + ['- ' + x for x in data['next_actions']] + ['', '## Limitations'] + ['- ' + x for x in data['limitations']]
    prefix.with_suffix('.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    labels = {
        'NOT_APPLICABLE_TO_X86_PATH': 'Not applicable to the x86-specific path',
        'PREREQUISITES_DETECTED': 'Required CPU features detected',
        'NOT_DETECTED': 'Required CPU features not all detected',
        'UNKNOWN': 'CPU feature evidence unavailable',
    }
    print('\nJava4Shell | Local Host Assessment')
    print('─' * 55)
    print(f'Host              {system} {platform.release()} ({arch})')
    print(f'CPU applicability {labels.get(cpu_status, cpu_status)}')
    print('Assessment scope  Local CPU/JVM prerequisite triage')
    print(f'Finding           {conclusion}')
    print(f'Live JVM probe    {runtime_finding} ({"PASS" if live else "UNAVAILABLE"})')
    print('Application risk  Not determined (application not tested)')
    print(f'Java runtime      {java_exe or "Not found"}')
    print('─' * 55)
    print(f'Next step         {followup}')
    print('This is not an application exploitability or patch verification test.')
    print('Reports:')
    print(f'  Markdown  {prefix.with_suffix(".md")}')
    print(f'  JSON      {prefix.with_suffix(".json")}')

if __name__ == '__main__':
    main()
