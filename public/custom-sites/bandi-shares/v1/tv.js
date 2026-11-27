/* TradingView widgets that follow the site theme. Rendered lazily, re-rendered on theme change. */
(function(){
var root=document.documentElement;
function theme(){return root.dataset.theme==='light'?'light':'dark'}
var GOLD={lineColor:'rgba(214,160,46,1)',topColor:'rgba(214,160,46,0.22)',bottomColor:'rgba(214,160,46,0)'};
var CFG={
 mini:function(el){return {src:'embed-widget-mini-symbol-overview.js',cfg:Object.assign({symbol:el.dataset.sym,width:'100%',height:'100%',locale:'en',dateRange:'1M',colorTheme:theme(),isTransparent:true,autosize:true,largeChartUrl:'',chartOnly:false,noTimeScale:true},GOLD)}},
 overview:function(){return {src:'embed-widget-symbol-overview.js',cfg:Object.assign({symbols:[['Gold','OANDA:XAUUSD|1M'],['USD/ZAR','OANDA:USDZAR|1M'],['DXY','CAPITALCOM:DXY|1M'],['EUR/USD','FX:EURUSD|1M']],chartOnly:false,width:'100%',height:'100%',locale:'en',colorTheme:theme(),autosize:true,showVolume:false,scalePosition:'right',scaleMode:'Normal',fontFamily:'Inter, sans-serif',fontSize:'10',valuesTracking:'1',changeMode:'price-and-percent',chartType:'area',lineWidth:2,isTransparent:true,backgroundColor:'rgba(0,0,0,0)',dateRanges:['1d|1','1m|30','3m|60','12m|1D']},GOLD)}},
 events:function(){return {src:'embed-widget-events.js',cfg:{colorTheme:theme(),isTransparent:true,width:'100%',height:'100%',locale:'en',importanceFilter:'1',countryFilter:'us,eu,gb,jp,za,cn'}}}
};
function render(el){
  var c=CFG[el.dataset.tv];if(!c)return;var o=c(el);
  el.innerHTML='';var z=document.createElement('div');z.className='tvz';el.appendChild(z);var box=document.createElement('div');box.className='tradingview-widget-container';box.style.height='100%';
  var w=document.createElement('div');w.className='tradingview-widget-container__widget';w.style.height='100%';box.appendChild(w);
  var s=document.createElement('script');s.src='https://s3.tradingview.com/external-embedding/'+o.src;s.async=true;s.text=JSON.stringify(o.cfg);box.appendChild(s);
  z.appendChild(box);el._r=1;
}
var els=[].slice.call(document.querySelectorAll('[data-tv]'));
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){render(e.target);io.unobserve(e.target)}})},{rootMargin:'400px'});els.forEach(function(el){io.observe(el)})}else els.forEach(render);
var last=theme();
function retheme(){var t=theme();if(t===last)return;last=t;els.forEach(function(el){if(el._r)render(el)})}
addEventListener('themechange',retheme);
try{new MutationObserver(retheme).observe(root,{attributes:true,attributeFilter:['data-theme']})}catch(e){}
})();
