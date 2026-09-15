/**
 * Os nomes dos programas nunca podem aparecer cortados com "..." na
 * Programação, no Hero, nos lembretes nem no "Sobre". Guarda contra voltar a
 * pôr numberOfLines/ellipsizeMode nesses ecrãs.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '../..');
const files = [
  'components/schedule/TimelineItem.tsx',
  'components/schedule/NowOnAirHero.tsx',
  'components/schedule/Timeline.tsx',
  'components/schedule/DaySelector.tsx',
  'components/RemindersBottomSheet.tsx',
  'components/AboutBottomSheet.tsx',
  'screens/ScheduleScreen.tsx',
];

describe('schedule texts are never truncated', () => {
  it.each(files)('%s has no numberOfLines/ellipsizeMode', (file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    expect(source).not.toMatch(/numberOfLines|ellipsizeMode/);
  });
});
