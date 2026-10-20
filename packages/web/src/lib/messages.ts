import type { DomainError, PlayerError, ScoreIssue } from '@volan/domain';
import { ApiError } from './api.js';

// Тексты ошибок для людей. Коды и параметры приходят из domain и сервера (D85).

export function domainErrorText(error: DomainError | PlayerError): string {
	switch (error.code) {
		case 'event.exists':
			return 'Событие уже создано';
		case 'event.notFound':
			return 'Событие не найдено';
		case 'event.mismatch':
			return 'Команда относится к другому событию';
		case 'event.finished':
			return 'Турнир завершён — сначала верните его в работу';
		case 'event.notSetup':
			return 'Турнир уже начат';
		case 'event.notRunning':
			return 'Турнир не идёт';
		case 'event.notFinished':
			return 'Турнир ещё не завершён';
		case 'event.noSchedule':
			return 'Сначала составьте расписание';
		case 'event.matchesStarted':
			return 'Матчи уже вызывались на корты';
		case 'event.matchesOnCourt':
			return 'На кортах ещё идут матчи';
		case 'court.notFound':
			return `Нет корта ${error.court}`;
		case 'court.disabled':
			return `Корт ${error.court} выключен`;
		case 'court.busy':
			return `Корт ${error.court} занят`;
		case 'category.exists':
			return 'Категория уже есть';
		case 'category.notFound':
			return 'Категория не найдена';
		case 'category.hasEntries':
			return 'В категории есть участники — разряд не меняется';
		case 'category.hasResults':
			return 'В категории есть сыгранные матчи';
		case 'entry.exists':
			return 'Участник уже добавлен';
		case 'entry.notFound':
			return 'Участник не найден';
		case 'entry.composition':
			return error.reason === 'count'
				? 'Неверное число игроков для разряда'
				: error.reason === 'duplicate'
					? 'Один и тот же игрок указан дважды'
					: 'Пол игроков не подходит к разряду';
		case 'entry.playerAlreadyInCategory':
			return 'Игрок уже заявлен в эту категорию';
		case 'entry.hasResults':
			return 'У участника есть сыгранные матчи — его можно только снять';
		case 'entry.onCourt':
			return 'Участник сейчас на корте';
		case 'entry.withdrawn':
			return 'Участник уже снят';
		case 'entry.notWithdrawn':
			return 'Участник не снят';
		case 'group.notFound':
			return 'Группа не найдена';
		case 'group.tooFewEntries':
			return 'Нужно хотя бы два участника';
		case 'group.started':
			return 'Матчи группы уже вызывались — расписание не пересобрать';
		case 'group.hasWithdrawn':
			return 'В группе есть снятый участник — верните или удалите его';
		case 'group.notComplete':
			return 'Сыграны ещё не все матчи группы';
		case 'group.notTied':
			return 'Эти участники не равны по показателям';
		case 'match.notFound':
			return 'Матч не найден';
		case 'match.notPending':
			return 'Матч уже не в очереди';
		case 'match.notOnCourt':
			return 'Матч не на корте';
		case 'match.notFinished':
			return 'Матч ещё не сыгран';
		case 'match.playerBusy':
			return 'Игрок сейчас на другом корте';
		case 'match.byWithdrawal':
			return 'Это неявка из-за снятия — верните участника, чтобы её убрать';
		case 'match.resultChanged':
			return 'Результат уже изменили с другого устройства';
		case 'match.stateChanged':
			return 'Матч уже изменили — отменить нельзя';
		case 'score.invalid':
			return error.issues.map(scoreIssueText).join('; ');
		case 'player.exists':
			return 'Игрок с таким ID уже есть';
		case 'player.notFound':
			return 'Игрок не найден';
		case 'player.forbidden':
			return 'Править может только автор записи или суперюзер';
		case 'player.changed':
			return 'Запись уже изменили с другого устройства';
		case 'player.merged':
			return 'Запись уже объединена с другой';
		case 'player.notMerged':
			return 'Запись не объединена';
		case 'player.sameRecord':
			return 'Нельзя объединить запись с самой собой';
		case 'player.inUse':
			return 'Игрок заявлен в событиях — его можно только объединить с другим';
	}
}

export function scoreIssueText(issue: ScoreIssue): string {
	const game = 'game' in issue ? issue.game + 1 : 0;
	switch (issue.code) {
		case 'game.invalidNumber':
			return `Партия ${game}: неверное число`;
		case 'game.overshoot':
			return `Партия ${game}: так не бывает — партия закончилась раньше`;
		case 'game.overCap':
			return `Партия ${game}: больше предела очков`;
		case 'game.notFinished':
			return `Партия ${game}: не доиграна`;
		case 'game.tie':
			return `Партия ${game}: ничья`;
		case 'match.extraGame':
			return `Партия ${game} лишняя — матч уже решён`;
		case 'match.noGames':
			return 'Нет ни одной партии';
		case 'match.tooManyGames':
			return 'Партий больше, чем позволяет формат';
		case 'match.notFinished':
			return 'Матч не решён';
		case 'match.alreadyDecided':
			return 'К моменту отказа матч уже решён';
		case 'match.winnerMismatch':
			return 'Победитель не совпадает со счётом';
		case 'walkover.hasGames':
			return 'При неявке счёта нет';
	}
}

// Что делала команда — для списка конфликтов
const COMMAND_LABEL: Record<string, string> = {
	'event.create': 'Создание события',
	'event.update': 'Изменение события',
	'event.setVisibility': 'Публикация события',
	'event.setCourts': 'Число кортов',
	'court.setEnabled': 'Включение или выключение корта',
	'event.start': 'Начало турнира',
	'event.backToSetup': 'Возврат в настройку',
	'event.finish': 'Завершение турнира',
	'event.reopen': 'Возврат турнира в работу',
	'category.create': 'Создание категории',
	'category.update': 'Изменение категории',
	'category.delete': 'Удаление категории',
	'category.restore': 'Возврат категории',
	'entry.add': 'Добавление участника',
	'entry.update': 'Замена игрока в паре',
	'entry.remove': 'Удаление участника',
	'entry.withdraw': 'Снятие участника',
	'entry.reinstate': 'Возврат участника',
	'group.generateSchedule': 'Составление расписания',
	'group.clearSchedule': 'Удаление расписания',
	'group.resolveTie': 'Жребий',
	'group.clearTie': 'Снятие жребия',
	'queue.move': 'Перестановка в очереди',
	'match.call': 'Вызов на корт',
	'match.uncall': 'Отмена вызова',
	'match.moveCourt': 'Перенос на другой корт',
	'match.recordResult': 'Результат',
	'match.clearResult': 'Стирание результата',
	'match.restore': 'Отмена действия с матчем',
	'player.create': 'Новый игрок',
	'player.update': 'Правка игрока',
	'player.delete': 'Удаление игрока',
	'player.merge': 'Объединение игроков',
	'player.unmerge': 'Отмена объединения'
};

export function commandLabel(type: string): string {
	return COMMAND_LABEL[type] ?? type;
}

const API_TEXTS: Record<string, string> = {
	network: 'Нет связи с сервером',
	'auth.invalid': 'Неверный логин или пароль',
	'auth.required': 'Нужно войти',
	'auth.forbidden': 'Нет прав',
	'auth.wrongPassword': 'Текущий пароль неверен',
	'user.loginTaken': 'Логин занят',
	'event.notFound': 'Событие не найдено',
	'event.forbidden': 'Нет прав на это событие',
	'event.hasResults': 'В событии есть сыгранные матчи — удалить может только суперюзер',
	'request.invalid': 'Неверные данные',
	'session.notFound': 'Устройство уже вышло',
	'user.notFound': 'Пользователь не найден',
	'rejected.notFound': 'Конфликт уже разобран'
};

export function apiErrorText(error: unknown): string {
	if (error instanceof ApiError) return API_TEXTS[error.code] ?? `Ошибка сервера (${error.code})`;
	return 'Неизвестная ошибка';
}
