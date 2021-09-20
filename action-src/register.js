import Observable from 'zen-observable';

global.Observable = Observable;
(await import('any-observable/register'))('global.Observable');

await import('./main');
