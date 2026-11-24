// One photo button for the whole app. Newer Android phones open the gallery for a plain file
// picker and leave out the camera, so this asks first: take a photo, or choose one.
import { useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';

export function PickPhoto({ onFile, label, class: cls = 'btn outline', style, disabled, title = 'Add a photo' }) {
  const [open, setOpen] = useState(false);
  const camRef = useRef();
  const galRef = useRef();
  const got = (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    setOpen(false);
    if (f) onFile(f);
  };
  return (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" class="sr" tabIndex={-1} aria-hidden="true" onChange={got} />
      <input ref={galRef} type="file" accept="image/*" class="sr" tabIndex={-1} aria-hidden="true" onChange={got} />
      <button type="button" class={cls} style={style} disabled={disabled} onClick={() => setOpen(true)}>
        <Icon name="camera" size={20} />{label}
      </button>
      {open && (
        <div class="scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <section class="sheet" role="dialog" aria-label={title}>
            <div class="handle" />
            <h2 class="title" style="font-size:20px;margin:0">{title}</h2>
            <button type="button" class="btn block" onClick={() => camRef.current.click()}><Icon name="camera" size={20} />Take a photo</button>
            <button type="button" class="btn outline block" onClick={() => galRef.current.click()}><Icon name="book" size={20} />Choose from gallery</button>
            <button type="button" class="link" style="align-self:center;min-height:44px" onClick={() => setOpen(false)}>Cancel</button>
          </section>
        </div>
      )}
    </>
  );
}
