// a TV's remote or a game controller: no pointer, only arrows, OK and back. browsers move focus with Tab alone, and a card is a
// div, so here the arrows go to the nearest thing that way. only on a TV, with a controller or ?tv=1: a desktop's arrows still scroll.
(function(root){
  const AXIS={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  // what's in that direction, edge to edge, or null. rects: { left, right, top, bottom, width, height } of each item's .rect
  function pick(from,list,key){
    const [dx,dy]=AXIS[key];let best=null,least=Infinity;
    for(const item of list){
      const r=item.rect,size=dx?Math.min(from.width,r.width):Math.min(from.height,r.height);
      const ahead=dx>0?r.left-from.right:dx<0?from.left-r.right:dy>0?r.top-from.bottom:from.top-r.bottom;
      if(ahead<-size*.3)continue; // behind or beside it. not 0: a focused card grows over its neighbours
      const side=dx?Math.max(0,from.top-r.bottom,r.top-from.bottom):Math.max(0,from.left-r.right,r.left-from.right);
      if(dx&&side>0)continue; // left and right stay on the row: the end of a row doesn't wrap into the next one
      const off=dx?Math.abs(from.top+from.bottom-r.top-r.bottom)/2:Math.abs(from.left+from.right-r.left-r.right)/2;
      const score=Math.max(ahead,0)+side*2+off*.1; // of the equally near (a row of cards), the one most in line
      if(score<least){least=score;best=item;}
    }
    return best;
  }
  if(typeof module!=='undefined')module.exports={pick};
  if(typeof document==='undefined')return;

  const SEL='a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"]),.card:not(.skel),.dl,.player .stage';
  const BAR='#nav,.rd-head,.rd-bar,#selbar'; // the page moves under these: only reached once nothing's left in it, or the top bar would always be nearest
  const TYPING='input:not([type=range],[type=checkbox],[type=radio],[type=button]),textarea';
  const q=s=>document.querySelector(s);
  const active=()=>document.activeElement||document.body;
  const reader=()=>q('.reader,.nv-reader');
  let on=false,last=null,origin=null,held=null,settling=0;

  // what has the keys: the top sheet or menu, else the page
  const scope=()=>[...document.querySelectorAll('.context-menu,.sheet-wrap.open,.set-modal-wrap,.trailer')].at(-1)||(document.body.classList.contains('drawer-open')&&q('#drawer'))||[...document.querySelectorAll('.dd.open .dd-menu')].at(-1)||document.body;
  const usable=el=>{
    if(el.matches('.card *,.arrow,[disabled],[type=hidden]')||el.closest('[hidden],[inert]'))return false; // a card's own buttons only show under a mouse: its long-press menu has them
    const r=el.getBoundingClientRect();if(r.width<2||r.height<2)return false;
    const s=getComputedStyle(el);return s.visibility!=='hidden'&&+s.opacity>0&&s.pointerEvents!=='none';
  };
  const items=box=>[...box.querySelectorAll(SEL)].filter(el=>(box!==document.body||!el.closest('#drawer'))&&usable(el)).map( // (shut, the drawer only waits off the screen)
    el=>({el,rect:el.getBoundingClientRect(),bar:!!el.closest(BAR)}));
  function focus(el,scroll=true,smooth=true){
    if(!el.matches('a[href],button,input,select,textarea,[tabindex]'))el.tabIndex=-1;
    el.focus({preventScroll:true});last=el.getBoundingClientRect();setTimeout(()=>{if(active()===el)last=el.getBoundingClientRect();},500); // again once the glide's over: a redraw puts the ring back by this
    if(scroll&&!el.closest(BAR))el.scrollIntoView({block:'center',inline:'center',behavior:smooth?'smooth':'auto'}); // a held key would queue up a slow glide per card
  }
  // nothing has focus, or the sheet closed: put the ring back, near where it was, without moving the page. not on a text box: the TV's keyboard would open
  function settle(pressed=false){ // pressed: the top bar will do. by itself it waits for the page: OK pressed twice while one loads would hit the logo and go home
    if(!on)return;
    const box=scope(),a=active(),top=box===document.body;
    if(top&&a.matches('.card *'))return focus(a.closest('.card'),false); // a closed menu hands focus back to the card's hidden list button, which OK would then press
    if(!top&&!box.contains(a)){
      if(!origin)origin=a;
      const list=items(box),first=list.find(x=>x.el.matches('.on'))||list.find(x=>!x.el.matches(TYPING))||list[0];if(first)focus(first.el,false);
      return;
    }
    if(top&&origin){const back=origin;origin=null;if(back.isConnected&&back!==document.body)return focus(back,false);}
    if(a!==document.body&&a.isConnected)return;
    if(reader())return; // a reader starts with nothing lit: the arrows read (see move)
    if(q('.player .stage'))return focus(q('.player .stage'),false);
    const all=items(box).filter(x=>!x.el.matches(TYPING)),seen=all.filter(x=>x.rect.bottom>0&&x.rect.top<innerHeight&&x.rect.right>0&&x.rect.left<innerWidth);
    const inPage=seen.filter(x=>!x.bar),pool=inPage.length?inPage:all.some(x=>!x.bar)?all.filter(x=>!x.bar):pressed?all:[];
    const rtl=document.documentElement.dir==='rtl',at=last?[(last.left+last.right)/2,(last.top+last.bottom)/2]:[rtl?innerWidth:0,0];
    let best=null,least=Infinity;for(const x of pool){const d=Math.hypot((x.rect.left+x.rect.right)/2-at[0],(x.rect.top+x.rect.bottom)/2-at[1]);if(d<least){least=d;best=x;}}
    if(best)focus(best.el,false);
  }
  const later=()=>{cancelAnimationFrame(settling);settling=requestAnimationFrame(()=>settle());};

  const scroller=el=>{for(let p=el;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p).overflowY;if(/auto|scroll/.test(s)&&p.scrollHeight>p.clientHeight)return p;}return document.scrollingElement;};
  const canScroll=(s,dy)=>dy<0?s.scrollTop>1:s.scrollTop+s.clientHeight<s.scrollHeight-1;
  const page=(s,dy,smooth=true)=>s.scrollBy({top:dy*innerHeight*.6,behavior:smooth?'smooth':'auto'});
  const video=()=>{const f=q('.player iframe.mplayer');try{return q('.player video')||(f?.hasAttribute('srcdoc')?f.contentDocument?.querySelector('video'):null);}catch{return null;}}; // a host's player is another site's page, out of reach

  function move(e){
    const a=active(),box=scope(),[dx,dy]=AXIS[e.key];
    if(box===document.body&&reader()&&!a.matches(SEL)){ // reading: up and down go through the text. left and right turn pages (novel-reader.js, the manga's own scroller)
      if(dy&&a===document.body){e.preventDefault();page(document.scrollingElement,dy,!e.repeat);}
      return;
    }
    if(!box.contains(a)||!a.matches(SEL)){e.preventDefault();return settle(true);}
    if(a.matches('input[type=range]')&&dx){ // a controller's press is no real key: the slider won't move by itself
      if(!e.isTrusted){e.preventDefault();a[dx>0?'stepUp':'stepDown']();a.dispatchEvent(new Event('input',{bubbles:true}));a.dispatchEvent(new Event('change',{bubbles:true}));}
      return;
    }
    if(a.matches(TYPING)&&a.value&&(dx||a.matches('textarea')))return; // the caret's
    if(a.matches('.player .stage')&&dx&&video()){e.preventDefault();video().currentTime+=dx*10;return;}
    e.preventDefault();
    const all=items(box).filter(x=>x.el!==a),bar=!!a.closest(BAR),from=a.getBoundingClientRect();
    const best=pick(from,bar?all:all.filter(x=>!x.bar),e.key),s=scroller(a);
    const gap=best?(dy>0?best.rect.top-from.bottom:from.top-best.rect.bottom):0;
    // long text in between (a story, a chapter's end) gets read on the way, not jumped over
    if(dy&&!bar&&(!best||gap>innerHeight*.8)&&canScroll(s,dy))return page(s,dy,!e.repeat);
    const to=best||pick(from,all,e.key);if(to)focus(to.el,true,!e.repeat);
  }

  function menuOf(el){const free=el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));if(!free){pressed=null;later();}return !free;} // pressed: app.js takes it for a touch, whose click comes next and is ignored
  function ok(el){
    if(el.matches('.player .stage')){const f=q('.player iframe.mplayer');if(q('#pp')&&!q('.pbar[hidden]'))q('#pp').click();else f?.focus();return;} // a host's player keeps the keys from then on: back leaves it
    el.click();setTimeout(later,60); // a sheet or menu may have opened
  }
  function onDown(e){
    if(!on||e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;
    if(['Escape','GoBack','BrowserBack'].includes(e.key)||[461,10009].includes(e.keyCode)){e.stopPropagation();e.preventDefault();return e.repeat||goBack();} // 461, 10009: webOS's and Tizen's back. stop: app.js's own Escape would close a second layer
    if(AXIS[e.key])return move(e);
    const a=active();
    if(e.key==='ContextMenu'&&a.matches(SEL)){e.preventDefault();menuOf(a);return;}
    if(e.key!=='Enter')return;
    if(a.matches('select,'+TYPING)){if(!e.isTrusted)a.matches('select')?a.showPicker?.():a.click();return;} // their own: the list, the keyboard, sending the form
    e.preventDefault();if(e.repeat||held)return;
    if(!a.matches(SEL)||!scope().contains(a)){
      if(reader()&&scope()===document.body){reader().classList.remove('hide-ui');const first=items(document.body).find(x=>x.bar);if(first)focus(first.el,false);return;}
      return settle(); // only the arrows reach the top bar on a page still loading
    }
    held={el:a,timer:setTimeout(()=>{const el=held?.el;held=null;if(el&&!menuOf(el))ok(el);},600)}; // held down: the long-press menu; a press on keyup
  }
  function onUp(e){
    if(e.key!=='Enter'||!held)return;
    clearTimeout(held.timer);const {el}=held;held=null;if(el.isConnected)ok(el);
  }
  function goBack(){
    if(back()||q('.player'))return later(); // (back clicks the player's own button, and says nothing)
    const a=active();
    if(reader()&&a.matches(SEL)&&!a.matches('.rd-pages')){a.blur();last=null;q('.rd-pages[tabindex]')?.focus({preventScroll:true});return;} // off the bars, back to reading
    history.back();
  }

  // a standard controller: A, B, X, the pad and the left stick become the keys above, so sheets, menus and readers all hear the same thing
  const PAD={0:'Enter',1:'GoBack',2:'ContextMenu',12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight'},down=new Map();let polling=0;
  const send=(type,key,repeat=false)=>active().dispatchEvent(new KeyboardEvent(type,{key,repeat,bubbles:true,cancelable:true}));
  function poll(){
    if(document.hidden)return;
    const now=performance.now(),keys=new Set();
    for(const p of navigator.getGamepads?.()||[]){
      if(!p)continue;
      for(const [i,key] of Object.entries(PAD))if(p.buttons[i]?.pressed)keys.add(key);
      const [x=0,y=0]=p.axes;if(x<-.6)keys.add('ArrowLeft');if(x>.6)keys.add('ArrowRight');if(y<-.6)keys.add('ArrowUp');if(y>.6)keys.add('ArrowDown');
    }
    for(const key of keys){
      if(!down.has(key)){send('keydown',key);down.set(key,now+350);}
      else if(AXIS[key]&&now>=down.get(key)){send('keydown',key,true);down.set(key,now+130);}
    }
    for(const key of [...down.keys()])if(!keys.has(key)){down.delete(key);send('keyup',key);}
  }

  function start(){
    if(on)return;on=true;
    document.body.classList.add('tv');
    document.addEventListener('keydown',onDown);document.addEventListener('keyup',onUp);
    new MutationObserver(later).observe(document.body,{childList:true,subtree:true}); // a new page, a redrawn one, a sheet
    addEventListener('hashchange',()=>{last=null;origin=null;closeContextMenu()||closeSheet();later();}); // a TV's back button may never reach the page as a key: it just goes back, so nothing's left open over the new page
    later();
  }
  addEventListener('gamepadconnected',()=>{start();polling||=setInterval(poll,40);});
  addEventListener('gamepaddisconnected',()=>{if(![...navigator.getGamepads?.()||[]].some(Boolean)){clearInterval(polling);polling=0;}});
  // (any-pointer: none): no touch, no mouse, which is Android TV; the names are for those that report one anyway
  if(/[?&]tv=1/.test(location.search)||matchMedia('(any-pointer: none)').matches||/Android TV|GoogleTV|BRAVIA|\bAFT[A-Z]|SmartTV|SMART-TV|Web0S|Tizen|HbbTV/i.test(navigator.userAgent))start();
})(globalThis);
