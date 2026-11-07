import { GAME_SCHOOLS } from '@/lib/game/schools';
import { getSchools } from '@/lib/game/server/queries';
import { routes } from '@/lib/routes';
import { PageHeader, TextLink } from '@/components/ui';
import { StartDuelButton } from '@/components/game/DuelButtons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Schools' };

/**
 * The schools (docs/rules.md §23.7, §23.8): opponents that read every tape once, offline, under a
 * published playbook, and show their working once you have played the tape.
 *
 * Each record is the one §23.8 asks a school to clear: on the tapes it traded, its mean grade beside
 * what sitting out graded on the same tapes. A school that cannot beat sitting out is printed as
 * such, not hidden.
 */
export default async function SchoolsPage() {
  const schools = await getSchools();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Schools"
        title="Opponents that show their working."
        lede="A school reads each tape before you do, draws its levels, and places one trade or sits out — then plays it live beside yours. When the tape ends you can read what it saw and why."
      />
      <div className="grid gap-3">
        {schools.map((school) => {
          const spec = GAME_SCHOOLS.find((s) => s.code === school.code);
          const beats = school.meanGrade !== null && school.sitOutMean !== null ? school.meanGrade > school.sitOutMean : null;
          return (
            <div key={school.code} className="bg-surface-2 border-line flex flex-col gap-4 rounded-2xl border p-5 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <div className="eyebrow text-gold-ink">{school.version}</div>
                <h2 className="text-ink-max mt-1 text-2xl font-semibold">{school.name}</h2>
                <p className="text-ink-lo mt-1">{school.playbook}</p>
                {spec && <pre className="text-ink-lo bg-surface-1 border-line-faint mt-3 whitespace-pre-wrap rounded-lg border p-3 font-sans text-xs leading-relaxed">{spec.playbook}</pre>}
              </div>
              <div className="flex shrink-0 flex-col gap-3 md:w-64">
                <dl className="text-mini grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-ink-dim">Tapes read</dt>
                  <dd className="numeral text-ink-hi text-right">{school.reads}</dd>
                  <dt className="text-ink-dim">Traded</dt>
                  <dd className="numeral text-ink-hi text-right">{school.trades}</dd>
                  <dt className="text-ink-dim">Mean grade</dt>
                  <dd className="numeral text-ink-hi text-right">{school.meanGrade ?? '—'}</dd>
                  <dt className="text-ink-dim">Sitting out, same tapes</dt>
                  <dd className="numeral text-ink-hi text-right">{school.sitOutMean ?? '—'}</dd>
                </dl>
                <p className="text-ink-dim text-mini">
                  {school.reads === 0
                    ? 'No reads yet: this school has not been run over the library.'
                    : beats === null
                      ? 'Not enough trades to say.'
                      : beats
                        ? 'Ahead of sitting out on the tapes it traded. Not yet a significance test.'
                        : 'Behind sitting out on the tapes it traded.'}
                </p>
                <StartDuelButton school={school.code} label={`Duel ${school.name}`} block />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-ink-lo text-sm">
        The rules a school must meet, and why the old roster was retired, are in <TextLink href={routes.learn.rulebook('238-what-a-school-must-be')}>the rulebook</TextLink>.
      </p>
    </div>
  );
}
