import type { ScoreIssue } from './score';

// Ошибки применения команд: код + параметры. Тексты для людей — в интерфейсе.
export type DomainError =
	| { code: 'event.exists' }
	| { code: 'event.notFound' }
	| { code: 'event.mismatch' }
	| { code: 'event.finished' }
	| { code: 'event.notSetup' }
	| { code: 'event.notRunning' }
	| { code: 'event.notFinished' }
	| { code: 'event.noSchedule' }
	| { code: 'event.matchesStarted' }
	| { code: 'event.matchesOnCourt' }
	| { code: 'court.notFound'; court: number }
	| { code: 'court.disabled'; court: number }
	| { code: 'court.busy'; court: number }
	| { code: 'category.exists'; categoryId: string }
	| { code: 'category.notFound'; categoryId: string }
	| { code: 'category.hasEntries'; categoryId: string }
	| { code: 'category.hasResults'; categoryId: string }
	| { code: 'entry.exists'; entryId: string }
	| { code: 'entry.notFound'; entryId: string }
	| { code: 'entry.composition'; reason: 'count' | 'duplicate' | 'gender' }
	| { code: 'entry.playerAlreadyInCategory'; playerId: string }
	| { code: 'entry.hasResults'; entryId: string }
	| { code: 'entry.onCourt'; entryId: string }
	| { code: 'entry.withdrawn'; entryId: string }
	| { code: 'entry.notWithdrawn'; entryId: string }
	| { code: 'group.notFound'; groupId: string }
	| { code: 'group.tooFewEntries'; groupId: string }
	| { code: 'group.started'; groupId: string }
	| { code: 'group.hasWithdrawn'; groupId: string }
	| { code: 'group.notComplete'; groupId: string }
	| { code: 'group.notTied'; groupId: string }
	| { code: 'match.notFound'; matchId: string }
	| { code: 'match.notPending'; matchId: string }
	| { code: 'match.notOnCourt'; matchId: string }
	| { code: 'match.notFinished'; matchId: string }
	| { code: 'match.playerBusy'; matchId: string; playerId: string }
	| { code: 'match.byWithdrawal'; matchId: string }
	| { code: 'match.resultChanged'; matchId: string } // конфликт: результат уже другой
	| { code: 'match.stateChanged'; matchId: string } // конфликт при отмене: матч уже изменили
	| { code: 'score.invalid'; matchId: string; issues: ScoreIssue[] };

export type DomainErrorCode = DomainError['code'];
