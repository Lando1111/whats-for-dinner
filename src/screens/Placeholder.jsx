export function Placeholder({ title, text }) {
  return (
    <main class="main">
      <div class="row-head"><h1 class="title">{title}</h1></div>
      <div class="empty">
        <img src={`${import.meta.env.BASE_URL}icons/pizza-mark.svg`} alt="" />
        <p style="margin:0;font-weight:700">Coming soon</p>
        <p class="cap" style="margin:0;max-width:280px">{text}</p>
      </div>
    </main>
  );
}
