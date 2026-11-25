# Behaviour engine
Native JavaScript, no external dependencies. Import `engine.mjs` from a secure web origin. Instantiate BehaviourCollector with a dedicated, consented exercise element, call start(), then stop() to obtain aggregate observations. Use quality(sample) to validate and compare(baseline,sample) to calculate descriptive consistency. Use digest(profile) for a snapshot checksum, not an identity identifier.

Profiles use schemaVersion 2, inputMode desktop, exercise guided-phrase-and-targets, and three samples containing interval (ms), speed (CSS px/s), keys, moves, clicks, synthetic and seconds. Import only with explicit consent. Treat profiles as sensitive, untrusted data. Do not use for authentication or covert monitoring. No typed content is exported. Mobile and calibrated biometric models are not implemented. The example integration is behavior.js and index.html in Browser Footprint. Scores use median/MAD with a 15% relative floor and are not probabilities.

## Algorithm and research

Capture uses keydown intervals and consecutive pointer speed in CSS pixels/second. Four ordered target clicks contribute to quality; duration is diagnostic only. Typing and pointer capture run separately. Version 1 profiles require retraining. Three accepted exercises form the baseline. Quality = round(100 * min(1, keys/10, moves/10, clicks/4)). For interval and speed independently, center = median(baseline), MAD = median(abs(values - center)), scale = max(1.4826 * MAD, 0.15 * abs(center), 1), distance = abs(sample - center)/scale, score = 100/(1+distance). Overall score is rounded median of the two scores. These floors and mapping are uncalibrated heuristics. No dwell time is collected.

Research references (not validation of this engine):
- Killourhy and Maxion (2009), https://www.cs.cmu.edu/~ksk/KillourhyMaxion2009.pdf
- Adaptability of current keystroke and mouse behavioral biometric systems: A survey, https://doi.org/10.1016/j.cose.2025.104731

Evaluate with independent sessions, genuine and impostor samples, device and accessibility variation, FAR, FRR, ROC and EER before considering security use.

Pointer exercise: schema 5 uses shuffled quadrant targets with bounded jitter. Earlier profiles require retraining. Median pointer speed remains geometry-sensitive; no distance normalization or calibrated identity probability is implemented.
