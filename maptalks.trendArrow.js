/*!
 * maptalks.trendArrow v0.1.1
 * LICENSE : MIT
 * (c) 2016-2018 maptalks.org
 */
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('maptalks')) :
	typeof define === 'function' && define.amd ? define(['maptalks'], factory) :
	(factory(global.maptalks));
}(this, (function (maptalks) { 'use strict';

function distance(pt1, pt2) {
	const xdis = pt2.x - pt1.x;
	const ydis = pt2.y - pt1.y;
	return Math.sqrt(xdis * xdis + ydis * ydis);
}
function ratio(pt1, pt2) {
	const vecX = pt2.x - pt1.x;
	const vecY = pt2.y - pt1.y;
	let vecLen = distance(pt1, pt2);
	if (vecLen < 0.0000001) return { x: 0, y: 0 };
	return { x: vecX / vecLen, y: vecY / vecLen };
}

function getCubicCurveLength(x0, y0, x1, y1, x2, y2) {
	// from https://math.stackexchange.com/questions/12186/arc-length-of-b%C3%A9zier-curves
	let v = {},
	    w = {};
	v.x = 2 * (x1 - x0);
	v.y = 2 * (y1 - y0);
	w.x = x2 - 2 * x1 + x0;
	w.y = y2 - 2 * y1 + y0;

	const uu = 4 * (w.x * w.x + w.y * w.y);

	if (uu < 0.00001) {
		return Math.sqrt((x2 - x0) * (x2 - x0) + (y2 - y0) * (y2 - y0));
	}

	const vv = 4 * (v.x * w.x + v.y * w.y),
	      ww = v.x * v.x + v.y * v.y;

	const t1 = 2 * Math.sqrt(uu * (uu + vv + ww)),
	      t2 = 2 * uu + vv,
	      t3 = vv * vv - 4 * uu * ww,
	      t4 = 2 * Math.sqrt(uu * ww);

	const error = 0.00001;
	return (t1 * t2 - t3 * Math.log(t2 + t1 + error) - (vv * t4 - t3 * Math.log(vv + t4 + error))) / (8 * Math.pow(uu, 1.5));
}

function getCubicControlPoints(x0, y0, x1, y1, x2, y2, x3, y3, smoothValue) {
	//from http://www.antigrain.com/research/bezier_interpolation/
	// Assume we need to calculate the control
	// points between (x1,y1) and (x2,y2).
	// Then x0,y0 - the previous vertex,
	//      x3,y3 - the next one.
	const xc1 = (x0 + x1) / 2.0,
	      yc1 = (y0 + y1) / 2.0;
	const xc2 = (x1 + x2) / 2.0,
	      yc2 = (y1 + y2) / 2.0;
	const xc3 = (x2 + x3) / 2.0,
	      yc3 = (y2 + y3) / 2.0;

	const len1 = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
	const len2 = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
	const len3 = Math.sqrt((x3 - x2) * (x3 - x2) + (y3 - y2) * (y3 - y2));

	const k1 = len1 / (len1 + len2);
	const k2 = len2 / (len2 + len3);

	const xm1 = xc1 + (xc2 - xc1) * k1,
	      ym1 = yc1 + (yc2 - yc1) * k1;

	const xm2 = xc2 + (xc3 - xc2) * k2,
	      ym2 = yc2 + (yc3 - yc2) * k2;

	// Resulting control points. Here smoothValue is mentioned
	// above coefficient K whose value should be in range [0...1].
	const ctrl1X = xm1 + (xc2 - xm1) * smoothValue + x1 - xm1,
	      ctrl1Y = ym1 + (yc2 - ym1) * smoothValue + y1 - ym1,
	      ctrl2X = xm2 + (xc2 - xm2) * smoothValue + x2 - xm2,
	      ctrl2Y = ym2 + (yc2 - ym2) * smoothValue + y2 - ym2;

	return [ctrl1X, ctrl1Y, ctrl2X, ctrl2Y];
}

// Anti-Clock rotate
function vecRotate(vec, theta) {
	const sin = Math.sin(theta * Math.PI / 180);
	const cos = Math.cos(theta * Math.PI / 180);
	return new maptalks.Point([vec.x * cos - vec.y * sin, vec.x * sin + vec.y * cos]);
}

function reversePts(pts) {
	let temp,
	    low = 0,
	    high = pts.length - 1;
	while (low < high) {
		temp = pts[low];
		pts[low] = pts[high];
		pts[high] = temp;
		low++;
		high--;
	}
	return pts;
}

const canvasExtend = {

	getSmoothLineParams: function (points, smoothValue, out_curveLengths, out_pointCurvatures) {
		if (!points || points.length < 2) {
			return;
		}

		if (points.length == 2 || !smoothValue) {
			out_curveLengths.push(distance(points[0], points[1]));
			out_pointCurvatures.push(ratio(points[0], points[1]));
			out_pointCurvatures.push(ratio(points[0], points[1]));
			return;
		}

		const extLen = 200;
		function extVec(pt1, pt2, extLen) {
			const vec = ratio(pt1, pt2);
			return { x: pt2.x + vec.x * extLen, y: pt2.y + vec.y * extLen };
		}
		const closed = true;
		let extPoints = [];
		extPoints.push(extVec(points[1], points[0], extLen));
		for (let i = 0; i < points.length; i++) extPoints.push(points[i]);
		extPoints.push(extVec(points[points.length - 2], points[points.length - 1], extLen));

		const count = extPoints.length;
		const l = count;

		let preCtrlPoints, lastCtrlPoints;
		for (let i = 0; i < l; i++) {
			const x1 = extPoints[i].x,
			      y1 = extPoints[i].y;

			let x0, y0, x2, y2, x3, y3;
			if (i - 1 < 0) {
				if (!close) {
					//the first point's prev point
					x0 = 2 * extPoints[i].x - extPoints[i + 1].x;
					y0 = 2 * extPoints[i].y - extPoints[i + 1].y;
				} else {
					x0 = extPoints[l - 1].x;
					y0 = extPoints[l - 1].y;
				}
			} else {
				x0 = extPoints[i - 1].x;
				y0 = extPoints[i - 1].y;
			}
			if (i + 1 < count) {
				x2 = extPoints[i + 1].x;
				y2 = extPoints[i + 1].y;
			} else {
				x2 = extPoints[i + 1 - count].x;
				y2 = extPoints[i + 1 - count].y;
			}
			if (i + 2 < count) {
				x3 = extPoints[i + 2].x;
				y3 = extPoints[i + 2].y;
			} else if (!close) {
				//the last point's next point
				x3 = 2 * extPoints[i + 1].x - extPoints[i].x;
				y3 = 2 * extPoints[i + 1].y - extPoints[i].y;
			} else {
				x3 = extPoints[i + 2 - count].x;
				y3 = extPoints[i + 2 - count].y;
			}

			const ctrlPoints = getCubicControlPoints(x0, y0, x1, y1, x2, y2, x3, y3, smoothValue);

			if (i === count - 1) {
				lastCtrlPoints = ctrlPoints;
			}
			extPoints[i].nextCtrlPoint = ctrlPoints.slice(0, 2);
			extPoints[i].prevCtrlPoint = preCtrlPoints ? preCtrlPoints.slice(2) : null;
			preCtrlPoints = ctrlPoints;
		}

		for (let i = 0; i < points.length; i++) {
			points[i] = extPoints[i + 1];
			const preCtrlPt = points[i].prevCtrlPoint,
			      nextCtrlPt = points[i].nextCtrlPoint;
			out_curveLengths && i != points.length - 1 && out_curveLengths.push(getCubicCurveLength(preCtrlPt[0], preCtrlPt[1], nextCtrlPt[0], nextCtrlPt[1], points[i + 1].x, points[i + 1].y));
			out_pointCurvatures && out_pointCurvatures.push(ratio({ x: preCtrlPt[0], y: preCtrlPt[1] }, { x: nextCtrlPt[0], y: nextCtrlPt[1] }));
		}
	},

	// reload paintSmoothLine with no beginPath
	paintSmoothLineNoBeginPath: function (ctx, points, smoothValue, close) {
		if (!points) {
			return;
		}
		if (points.length <= 2 || !smoothValue) {
			ctx.moveTo(points[0].x, points[0].y);
			ctx.lineTo(points[1].x, points[1].y);
			return;
		}

		const count = points.length;
		const l = close ? count : count - 1;

		//ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		let preCtrlPoints, lastCtrlPoints;
		for (let i = 0; i < l; i++) {
			const x1 = points[i].x,
			      y1 = points[i].y;

			let x0, y0, x2, y2, x3, y3;
			if (i - 1 < 0) {
				if (!close) {
					//the first point's prev point
					x0 = 2 * points[i].x - points[i + 1].x;
					y0 = 2 * points[i].y - points[i + 1].y;
				} else {
					x0 = points[l - 1].x;
					y0 = points[l - 1].y;
				}
			} else {
				x0 = points[i - 1].x;
				y0 = points[i - 1].y;
			}
			if (i + 1 < count) {
				x2 = points[i + 1].x;
				y2 = points[i + 1].y;
			} else {
				x2 = points[i + 1 - count].x;
				y2 = points[i + 1 - count].y;
			}
			if (i + 2 < count) {
				x3 = points[i + 2].x;
				y3 = points[i + 2].y;
			} else if (!close) {
				//the last point's next point
				x3 = 2 * points[i + 1].x - points[i].x;
				y3 = 2 * points[i + 1].y - points[i].y;
			} else {
				x3 = points[i + 2 - count].x;
				y3 = points[i + 2 - count].y;
			}

			const ctrlPoints = getCubicControlPoints(x0, y0, x1, y1, x2, y2, x3, y3, smoothValue);

			ctx.bezierCurveTo(ctrlPoints[0], ctrlPoints[1], ctrlPoints[2], ctrlPoints[3], x2, y2);

			if (i === count - 1) {
				lastCtrlPoints = ctrlPoints;
			}
			points[i].nextCtrlPoint = ctrlPoints.slice(0, 2);
			points[i].prevCtrlPoint = preCtrlPoints ? preCtrlPoints.slice(2) : null;
			preCtrlPoints = ctrlPoints;
		}
		points[points.length - 1].prevCtrlPoint = lastCtrlPoints ? lastCtrlPoints.slice(2) : null;
	}
};

maptalks.Util.extend(maptalks.Canvas, canvasExtend);

const originPaintOn = maptalks.LineString.prototype._paintOn;
const LineStringExtend = {
	_paintOn: function (ctx, points, lineOpacity, fillOpacity, dasharray) {

		if (this.options['smoothness'] && this.options["arrowStyle"] == "trend" && this.options["closed"] !== true) {
			this.curveLengths = [];
			this.pointCurvatures = [];
			maptalks.Canvas.getSmoothLineParams(points, this.options['smoothness'], this.curveLengths, this.pointCurvatures);

			const lineWidth = this._getInternalSymbol()['lineWidth'];
			const lineColor = this._getInternalSymbol()['lineColor'];
			const lineOpacity = this._getInternalSymbol()['lineOpacity'];

			this._patintTrendArrow(ctx, points, lineWidth, lineColor, lineOpacity);
		} else {
			originPaintOn.apply(this, arguments);
		}
	},

	_patintTrendArrow: function (ctx, points, lineWidth, lineColor, lineOpacity) {
		let leftOffsetPts = [],
		    rightOffsetPts = [];
		this._getOffsetCurvePoints(points, this.pointCurvatures, this.curveLengths, lineWidth, leftOffsetPts, rightOffsetPts);

		const len = points.length;

		let tailPts = [],
		    vec;
		vec = rightOffsetPts[0].substract(leftOffsetPts[0]);
		vec = vec.unit().multi(lineWidth * 0.8);

		tailPts.push(leftOffsetPts[0]);
		tailPts.push(points[0].add(vecRotate(vec, 90)));
		tailPts.push(rightOffsetPts[0]);

		let headPts = [];
		const headArrowSize = 13;
		const endPoint = points[len - 1];
		vec = rightOffsetPts[len - 1].substract(leftOffsetPts[len - 1]);
		vec = vec.perp().unit().multi(headArrowSize);
		const headPt = points[len - 1].add(vec);
		headPts.push(rightOffsetPts[len - 1]);
		headPts.push(points[len - 1].add(vecRotate(vec, -135)));
		headPts.push(headPt);
		headPts.push(points[len - 1].add(vecRotate(vec, 135)));
		headPts.push(leftOffsetPts[len - 1]);

		ctx.fillStyle = lineColor;

		ctx.beginPath();
		maptalks.Canvas._stroke(ctx, lineOpacity);

		ctx.moveTo(rightOffsetPts[0].x, rightOffsetPts[0].y);
		maptalks.Canvas.paintSmoothLineNoBeginPath(ctx, rightOffsetPts, this.options['smoothness'], false);

		for (let i = 0; i < headPts.length; i++) ctx.lineTo(headPts[i].x, headPts[i].y);

		reversePts(leftOffsetPts);
		maptalks.Canvas.paintSmoothLineNoBeginPath(ctx, leftOffsetPts, this.options['smoothness'], false);

		for (let i = 0; i < tailPts.length; i++) ctx.lineTo(tailPts[i].x, tailPts[i].y);

		maptalks.Canvas.fillCanvas(ctx, lineOpacity);
	},

	_getOffsetCurvePoints: function (points, pointCurvatures, curveLengths, maxOffset, _leftOffsetPts, _rightOffsetPts) {
		if (pointCurvatures.length !== points.length || curveLengths.length !== points.length - 1) return;

		let totalCurveLen = 0;
		let tempLen = 0;
		for (let i = 0; i < curveLengths.length; i++) {
			// not closed, curveNum is n-1 
			totalCurveLen += curveLengths[i];
		}

		function ifOnDirection(refvec, vec) {
			if (Math.abs(Math.atan(vec.y / vec.x) - Math.atan(refvec.y / refvec.x)) <= Math.PI) return true;
			return false;
		}

		for (let i = 0; i < points.length; i++) {
			let normal;
			let offset = maxOffset;
			normal = new maptalks.Point(pointCurvatures[i].x, pointCurvatures[i].y);

			if (i == 0) {
				offset = maxOffset;
			} else {
				tempLen += curveLengths[i - 1];
				offset = 2 + (maxOffset - 2) * (1 - tempLen / totalCurveLen);
			}

			const refvec = i !== points.length - 1 ? points[i + 1].substract(points[i]) : points[i].substract(points[i - 1]);

			const leftCrossVec = ifOnDirection(refvec, normal) ? normal._perp() : normal._perp().multi(-1);
			const rightCrossVec = leftCrossVec.multi(-1);

			_leftOffsetPts && _leftOffsetPts.push(points[i].add(leftCrossVec.multi(offset)));
			_rightOffsetPts && _rightOffsetPts.push(points[i].add(rightCrossVec.multi(offset)));
		}
	}
};

maptalks.LineString.include(LineStringExtend);

typeof console !== 'undefined' && console.log('maptalks.trendArrow v0.1.1');

})));