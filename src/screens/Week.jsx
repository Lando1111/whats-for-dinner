import { useState } from 'preact/hooks';
import { Icon } from '../icons.jsx';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekStart(offsetWeeks = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const mondayShift = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - mondayShift + offsetWeeks * 7);
  return d;
}

export function Week({ household }) {
  const [offset, setOffset] = useState(0);
  const start = weekStart(offset);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const end = days[6];
  const range = `${DAY[start.getDay()]} ${start.getDate()}${start.getMonth() !== end.getMonth() ? ' ' + MON[start.getMonth()] : ''} – ${DAY[end.getDay()]} ${end.getDate()} ${MON[end.getMonth()]}`;
  const label = offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : `${offset > 0 ? '+' : ''}${offset} weeks`;

  return (
    <main class="main">
      <header class="row-head">
        <img src={`${import.meta.env.BASE_URL}icons/pizza-mark.svg`} alt="" width="36" height="36" />
        <h1 class="title">What's for dinner?</h1>
      </header>
      <div class="row-head" style="gap:4px">
        <button class="icon-btn" aria-label="Previous week" onClick={() => setOffset(offset - 1)}><Icon name="back" /></button>
        <div style="display:flex;flex-direction:column">
          <span style="font-size:18px;line-height:22px;font-weight:700">{label}</span>
          <span class="cap">{range}</span>
        </div>
        <button class="icon-btn" aria-label="Next week" onClick={() => setOffset(offset + 1)}><Icon name="next" /></button>
      </div>
      <div class="grid2">
        {days.map((d) => {
          const isToday = d.getTime() === today.getTime();
          return (
            <button class={`tile${isToday ? ' today' : ''}`} aria-label={`${DAY[d.getDay()]} ${d.getDate()}, nothing planned`} disabled>
              <div class="pic"><Icon name="plus" size={28} /><span class="day">{isToday ? `Tonight · ${DAY[d.getDay()]} ${d.getDate()}` : `${DAY[d.getDay()]} ${d.getDate()}`}</span></div>
              <div class="body"><span style="font-size:15px;line-height:19px;font-weight:700">Nothing planned</span><span class="cap">Recipes come next</span></div>
            </button>
          );
        })}
        <button class="tile fill" disabled>
          <Icon name="dice" size={40} stroke={1.8} />
          <span style="font:600 22px/26px var(--display)">Fill the week</span>
          <span style="font-size:13px;line-height:17px">Works once you've added recipes</span>
        </button>
      </div>
      <p class="cap" style="margin:0;text-align:center">{household?.name} · planning arrives once recipes are in.</p>
    </main>
  );
}
