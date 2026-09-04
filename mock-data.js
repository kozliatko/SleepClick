// SleepClick — Mock Data Generator
// Run in the browser console on your SleepClick instance
// Generates 14 days of realistic baby sleep data

(function() {
  const TAGS = ['easy', 'nursing', 'pacifier', 'crying', 'stroller', 'sick'];
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[randInt(0, arr.length - 1)];
  const pickTags = () => TAGS.filter(() => Math.random() < 0.3);

  function makeSession(dateMs, startHour, startMin, durationMin, wakeUps = 0, tags = []) {
    const start = new Date(dateMs);
    start.setHours(startHour, startMin, 0, 0);
    const end = new Date(start.getTime() + durationMin * 60000);
    return {
      id: 'sleep_' + start.getTime() + '_' + Math.random().toString(36).slice(2, 6),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      wakeUps,
      tags,
      note: ''
    };
  }

  const logs = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const base = now.getTime() - dayOffset * 86400000;
    const prevBase = base - 86400000;

    // Night sleep: starts the previous evening ~21:00-22:30, runs 7-9h
    const nightStart = randInt(21 * 60, 22 * 60 + 30); // minutes from midnight
    const nightDur = randInt(7 * 60, 9 * 60);
    const nightWakeUps = randInt(0, 2);
    logs.push(makeSession(
      prevBase,
      Math.floor(nightStart / 60),
      nightStart % 60,
      nightDur,
      nightWakeUps,
      Math.random() < 0.5 ? ['nursing'] : []
    ));

    // Morning nap: ~09:00-10:00, 45-90 min
    const nap1Start = randInt(8 * 60 + 30, 10 * 60);
    const nap1Dur = randInt(45, 90);
    logs.push(makeSession(base, Math.floor(nap1Start / 60), nap1Start % 60, nap1Dur, 0, pickTags()));

    // Afternoon nap: ~13:00-14:00, 60-120 min
    const nap2Start = randInt(12 * 60 + 30, 14 * 60);
    const nap2Dur = randInt(60, 120);
    logs.push(makeSession(base, Math.floor(nap2Start / 60), nap2Start % 60, nap2Dur, 0, pickTags()));

    // Evening nap (60% chance): ~16:00-17:00, 20-40 min
    if (Math.random() < 0.6) {
      const nap3Start = randInt(15 * 60 + 30, 17 * 60);
      const nap3Dur = randInt(20, 40);
      logs.push(makeSession(base, Math.floor(nap3Start / 60), nap3Start % 60, nap3Dur, 0, pickTags()));
    }
  }

  // Sort newest first and store
  logs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  localStorage.setItem('sleepLogs', JSON.stringify(logs));

  console.log(`✅ Generated ${logs.length} records across 14 days. Reload the page.`);
  alert(`✅ Loaded ${logs.length} mock records. Reload the page (F5).`);
})();
