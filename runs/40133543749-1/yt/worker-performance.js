(function(){'use strict';function n(a){var b=0;return function(){return b<a.length?{done:!1,value:a[b++]}:{done:!0}}}
function p(a){var b=typeof Symbol!="undefined"&&Symbol.iterator&&a[Symbol.iterator];if(b)return b.call(a);if(typeof a.length=="number")return{next:n(a)};throw Error(String(a)+" is not an iterable or ArrayLike");}
function q(a,b){var c;b&&!b.done&&(c=a["return"])&&c.call(a)}
var r=typeof Object.defineProperties=="function"?Object.defineProperty:function(a,b,c){if(a==Array.prototype||a==Object.prototype)return a;a[b]=c.value;return a};
function t(a){a=["object"==typeof globalThis&&globalThis,a,"object"==typeof window&&window,"object"==typeof self&&self,"object"==typeof global&&global];for(var b=0;b<a.length;++b){var c=a[b];if(c&&c.Math==Math)return c}throw Error("Cannot find global object");}
var u=t(this);function w(a,b){if(b)a:{var c=u;a=a.split(".");for(var d=0;d<a.length-1;d++){var e=a[d];if(!(e in c))break a;c=c[e]}a=a[a.length-1];d=c[a];b=b(d);b!=d&&b!=null&&r(c,a,{configurable:!0,writable:!0,value:b})}}
var x=typeof Object.assign=="function"?Object.assign:function(a,b){if(a==null)throw new TypeError("No nullish arg");a=Object(a);for(var c=1;c<arguments.length;c++){var d=arguments[c];if(d)for(var e in d)Object.prototype.hasOwnProperty.call(d,e)&&(a[e]=d[e])}return a};
w("Object.assign",function(a){return a||x});var y=[1,2,4,8,16,30];function z(a){this.j=0;this.i=[];this.m=a.m;this.o=a.o===void 0?Math.ceil(60*a.m/1E3):a.o;a=p(y);var b=a.next();try{for(;!b.done;b=a.next())this.i.push(new A(b.value/60*1E3))}finally{q(a,b)}}
u.Object.defineProperties(z.prototype,{l:{configurable:!0,enumerable:!0,get:function(){return this.startTime===void 0||this.h===void 0?0:this.h-this.startTime}},
frameCount:{configurable:!0,enumerable:!0,get:function(){return this.j}}});
function B(a){var b=a.j>=a.o;return a.l>=a.m||b}
function A(a){this.l=a;this.i=this.h=0;this.u=this.j=void 0}
u.Object.defineProperties(A.prototype,{averageDurationBetweenEventsMs:{configurable:!0,enumerable:!0,get:function(){return this.h<=1?0:(this.u-this.j)/(this.h-1)}}});function C(a){if(self.requestAnimationFrame){var b=new z({m:a.durationMs}),c=function(d){if(!B(b)){b.j++;if(b.h===void 0)b.startTime=d;else{var e=d-b.h,g=p(b.i),h=g.next();try{for(;!h.done;h=g.next()){var f=h.value,k=f.i;f.i+=e;e>f.l+2&&(f.h++,f.j===void 0&&(f.j=k),f.u=k)}}finally{q(g,h)}}b.h=d}if(B(b)){d=self;e=d.postMessage;g=Object;h=g.assign;f=[];k=p(b.i);var l=k.next();try{for(;!l.done;l=k.next()){var m=l.value;var D=m.h!==0?{severityMs:Math.round(m.l),eventCount:m.h,averageDurationBetweenEventsMs:Math.round(m.averageDurationBetweenEventsMs)}:
void 0;var v=D;v&&f.push(v)}}finally{q(k,l)}e.call(d,{op:"captureDroppedFramesReply",summary:h.call(g,{},{summaries:f,monitoringDurationMs:Math.round(b.l)},{measurementMethod:"MEASUREMENT_METHOD_WEB_RAF_WORKER_POLLING"})})}else self.requestAnimationFrame(c)};
self.requestAnimationFrame(c)}else self.postMessage({op:"captureDroppedFramesReply",summary:void 0})}
;self.addEventListener("message",function(a){a=a.data;a.op==="captureDroppedFrames"&&C(a)});}).call(this);
