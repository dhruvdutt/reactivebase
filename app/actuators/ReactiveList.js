/* eslint max-lines: 0 */
import React, { Component } from "react";
import classNames from "classnames";
import manager from "../middleware/ChannelManager";
import JsonPrint from "../addons/JsonPrint";
import PoweredBy from "../sensors/PoweredBy";
import InitialLoader from "../addons/InitialLoader";
import NoResults from "../addons/NoResults";
import ResultStats from "../addons/ResultStats";
import Pagination from "../addons/Pagination";
import * as TYPES from "../middleware/constants";
import _ from "lodash";

const helper = require("../middleware/helper");
const $ = require("jquery");

export default class ReactiveList extends Component {
	constructor(props) {
		super(props);
		this.state = {
			markers: [],
			query: {},
			currentData: [],
			resultMarkup: [],
			isLoading: false,
			queryStart: false,
			resultStats: {
				resultFound: false,
				total: 0,
				took: 0
			},
			showPlaceholder: true,
			showInitialLoader: false,
			requestOnScroll: !this.props.pagination
		};
		if (this.props.sortOptions) {
			const obj = this.props.sortOptions[0];
			this.sortObj = {
				[obj.appbaseField]: {
					order: obj.sortBy
				}
			};
		} else if (this.props.sortBy) {
			this.sortObj = {
				[this.props.appbaseField]: {
					order: this.props.sortBy
				}
			};
		}
		this.resultSortKey = "ResultSort";
		this.channelId = null;
		this.channelListener = null;
		this.queryStartTime = 0;
		this.handleSortSelect = this.handleSortSelect.bind(this);
		this.nextPage = this.nextPage.bind(this);
		this.appliedQuery = {};
	}

	componentDidMount() {
		this.streamProp = this.props.stream;
		this.size = this.props.size;
		this.initialize();
	}

	componentWillUpdate() {
		setTimeout(() => {
			if (this.streamProp !== this.props.stream) {
				this.streamProp = this.props.stream;
				this.removeChannel();
				this.initialize(true);
			}
			if (this.size !== this.props.size) {
				this.size = this.props.size;
				this.setState({
					currentData: []
				});
				this.removeChannel();
				this.initialize(true);
			}
			if (this.props.pagination && this.paginationAtVal !== this.props.paginationAt) {
				this.paginationAtVal = this.props.paginationAt;
				this.executePaginationUpdate();
			}
		}, 300);
	}

	componentWillReceiveProps(nextProps) {
		if (nextProps.pagination !== this.pagination) {
			this.pagination = nextProps.pagination;
			this.setState({
				requestOnScroll: !nextProps.pagination
			}, () => {
				this.removeChannel();
				this.initialize(true);
			});
		}
	}

	// check the height and set scroll if scroll not exists
	componentDidUpdate() {
		if (!this.state.showPlaceholder && !this.props.scrollOnTarget) {
			this.applyScroll();
		}
	}

	// stop streaming request and remove listener when component will unmount
	componentWillUnmount() {
		this.removeChannel();
	}

	applyScroll() {
		const resultElement = $(this.listParentElement);
		const scrollElement = $(this.listChildElement);
		const padding = 45;

		const getHeight = item => item.height() ? item.height() : 0;

		const checkHeight = () => {
			const flag = resultElement.get(0).scrollHeight - padding > resultElement.height();
			const scrollFlag = scrollElement.get(0).scrollHeight > scrollElement.height();
			if (!flag && !scrollFlag && scrollElement.length && !this.props.pagination) {
				const headerHeight = getHeight(resultElement.find(".rbc-title")) + (getHeight(resultElement.find(".rbc-pagination")) * resultElement.find(".rbc-pagination").length);
				const finalHeight = resultElement.height() - 60 - headerHeight;
				if (finalHeight > 0) {
					scrollElement.css({
						height: scrollElement.height() + 15,
						"padding-bottom": 20
					});
				}
			}
		};

		if (resultElement && resultElement.length && scrollElement && scrollElement.length) {
			scrollElement.css({
				"height": "auto",
				"padding-bottom": 0
			});
			setTimeout(checkHeight.bind(this), 1000);
		}
	}

	removeChannel() {
		if (this.channelId) {
			manager.stopStream(this.channelId);
			this.channelId = null;
		}
		if (this.channelListener) {
			this.channelListener.remove();
		}
		if (this.loadListener) {
			this.loadListener.remove();
		}
	}

	// Create a channel which passes the react and receive results whenever react changes
	createChannel(executeChannel = false) {
		// Set the react - add self aggs query as well with react
		let react = this.props.react ? this.props.react : {};
		const reactAnd = ["streamChanges"];
		if (this.props.pagination) {
			reactAnd.push("paginationChanges");
			react.pagination = null;
		}
		if (this.sortObj) {
			this.enableSort(reactAnd);
		}
		react = helper.setupReact(react, reactAnd);
		// create a channel and listen the changes
		const channelObj = manager.create(this.context.appbaseRef, this.context.type, react, this.props.size, this.props.from, this.props.stream, this.context.app, this.context.appbaseCrdentials);
		this.channelId = channelObj.channelId;

		this.channelListener = channelObj.emitter.addListener(channelObj.channelId, (res) => {
			// implementation to prevent initialize query issue if old query response is late then the newer query
			// then we will consider the response of new query and prevent to apply changes for old query response.
			// if queryStartTime of channel response is greater than the previous one only then apply changes
			if (res.error && res.startTime > this.queryStartTime) {
				this.setState({
					queryStart: false,
					showPlaceholder: false
				});
				if (this.props.onAllData) {
					const modifiedData = helper.prepareResultData(res);
					this.props.onAllData(modifiedData.res, modifiedData.err);
				}
			}
			if (res.appliedQuery) {
				if (res.mode === "historic" && res.startTime > this.queryStartTime) {
					const visibleNoResults = res.appliedQuery && Object.keys(res.appliedQuery).length && res.data && !res.data.error ? (!(res.data.hits && res.data.hits.total)) : false;
					const resultStats = {
						resultFound: !!(res.appliedQuery && res.data && !res.data.error && res.data.hits && res.data.hits.total)
					};
					if (res.appliedQuery && res.data && !res.data.error) {
						resultStats.total = res.data.hits.total;
						resultStats.took = res.data.took;
					}
					this.setState({
						queryStart: false,
						visibleNoResults,
						resultStats,
						showPlaceholder: false
					});
					this.afterChannelResponse(res);
				} else if (res.mode === "streaming") {
					this.afterChannelResponse(res);
					this.updateResultStats(res.data);
				}
			} else {
				this.setState({
					showPlaceholder: true
				});
			}
		});
		this.listenLoadingChannel(channelObj);
		if (executeChannel) {
			setTimeout(() => {
				const obj = {
					key: "streamChanges",
					value: ""
				};
				helper.selectedSensor.set(obj, true);
			}, 100);
		}
	}

	updateResultStats(newData) {
		const resultStats = this.state.resultStats;
		resultStats.total = helper.updateStats(resultStats.total, newData);
		this.setState({
			resultStats
		});
	}

	listenLoadingChannel(channelObj) {
		this.loadListener = channelObj.emitter.addListener(`${channelObj.channelId}-query`, (res) => {
			if (res.appliedQuery) {
				const showInitialLoader = !(this.state.requestOnScroll && res.appliedQuery.body && res.appliedQuery.body.from);
				this.setState({
					queryStart: res.queryState,
					showInitialLoader
				});
			}
		});
	}

	afterChannelResponse(res) {
		const data = res.data;
		let rawData,
			markersData,
			newData = [],
			currentData = [];
		this.streamFlag = false;
		if (res.mode === "streaming") {
			this.channelMethod = "streaming";
			newData = data;
			newData.stream = true;
			currentData = this.state.currentData;
			this.streamFlag = true;
			markersData = this.setMarkersData(rawData);
		} else if (res.mode === "historic") {
			this.queryStartTime = res.startTime;
			this.channelMethod = "historic";
			newData = data.hits && data.hits.hits ? data.hits.hits : [];
			const normalizeCurrentData = this.normalizeCurrentData(res, this.state.currentData, newData);
			newData = normalizeCurrentData.newData;
			currentData = normalizeCurrentData.currentData;
		}
		this.setState({
			rawData,
			newData,
			currentData,
			markersData,
			isLoading: false
		}, () => {
			// Pass the historic or streaming data in index method
			res.allMarkers = rawData;
			let modifiedData = JSON.parse(JSON.stringify(res));
			modifiedData.newData = this.state.newData;
			modifiedData.currentData = this.state.currentData;
			delete modifiedData.data;
			modifiedData = helper.prepareResultData(modifiedData, data);
			const generatedData = this.props.onAllData ? this.props.onAllData(modifiedData.res, modifiedData.err) : this.defaultonAllData(modifiedData.res, modifiedData.err);
			this.setState({
				resultMarkup: this.wrapMarkup(generatedData),
				currentData: this.combineCurrentData(newData)
			});
		});
	}

	wrapMarkup(generatedData) {
		let markup = null;
		if (_.isArray(generatedData)) {
			markup = generatedData.map((item, index) => (
				<div key={index} className="rbc-list-item">
					{item}
				</div>
				)
			);
		} else {
			markup = generatedData;
		}
		return markup;
	}

	// normalize current data
	normalizeCurrentData(res, rawData, newData) {
		const appliedQuery = JSON.parse(JSON.stringify(res.appliedQuery));
		if (this.state.requestOnScroll && appliedQuery && appliedQuery.body) {
			delete appliedQuery.body.from;
			delete appliedQuery.body.size;
		}
		const isSameQuery = JSON.stringify(appliedQuery) === JSON.stringify(this.appliedQuery);
		const currentData = isSameQuery ? (rawData || []) : [];
		if (!currentData.length) {
			this.appliedQuery = appliedQuery;
		} else {
			newData = newData.filter((newRecord) => {
				let notExits = true;
				currentData.forEach((oldRecord) => {
					if (`${newRecord._id}-${newRecord._type}` === `${oldRecord._id}-${oldRecord._type}`) {
						notExits = false;
					}
				});
				return notExits;
			});
		}
		if (!isSameQuery) {
			$(".rbc.rbc-reactivelist").animate({
				scrollTop: 0
			}, 100);
		}
		return {
			currentData,
			newData
		};
	}

	combineCurrentData(newData) {
		if (_.isArray(newData)) {
			newData = newData.map((item) => {
				item.stream = false;
				return item;
			});
			return this.state.currentData.concat(newData);
		}
		return this.streamDataModify(this.state.currentData, newData, false);
	}

	// enable sort
	enableSort(reactAnd) {
		reactAnd.push(this.resultSortKey);
		const sortObj = {
			key: this.resultSortKey,
			value: this.sortObj
		};
		helper.selectedSensor.setSortInfo(sortObj);
	}

	// append data if pagination is applied
	appendData(data) {
		const rawData = this.state.rawData;
		const hits = rawData.hits.hits.concat(data.hits.hits);
		rawData.hits.hits = _.uniqBy(hits, "_id");
		return rawData;
	}

	// append stream boolean flag and also start time of stream
	streamDataModify(rawData, data, streamFlag = true) {
		if (data) {
			data.stream = streamFlag;
			data.streamStart = new Date();
			if (data._deleted) {
				const hits = rawData.filter(hit => hit._id !== data._id);
				rawData = hits;
			} else {
				const hits = rawData.filter(hit => hit._id !== data._id);
				rawData = hits;
				rawData.unshift(data);
			}
		}
		return rawData;
	}

	// tranform the raw data to marker data
	setMarkersData(hits) {
		if (hits) {
			return hits;
		}
		return [];
	}

	initialize(executeChannel = false) {
		this.createChannel(executeChannel);
		if (this.state.requestOnScroll) {
			this.listComponent();
		} else {
			this.setQueryForPagination();
		}
	}

	setQueryForPagination() {
		const valObj = {
			queryType: "match",
			inputData: this.props.appbaseField,
			customQuery: () => null
		};
		const obj = {
			key: "paginationChanges",
			value: valObj
		};
		helper.selectedSensor.setSensorInfo(obj);
	}

	executePaginationUpdate() {
		setTimeout(() => {
			const obj = {
				key: "paginationChanges",
				value: Math.random()
			};
			helper.selectedSensor.set(obj, true);
		}, 100);
	}

	paginationAt(method) {
		let pageinationComp;
		if (this.props.pagination && (this.props.paginationAt === method || this.props.paginationAt === "both")) {
			pageinationComp = (
				<div className="rbc-pagination-container col s12 col-xs-12">
					<Pagination
						className={`rbc-pagination-${method}`}
						componentId="pagination"
						onPageChange={this.props.onPageChange}
						title={this.props.paginationTitle}
						pages={this.props.pages}
					/>
				</div>
			);
		}
		return pageinationComp;
	}

	defaultonAllData(res) {
		let result = null;
		if (res) {
			let combineData = res.currentData;
			if (res.mode === "historic") {
				combineData = res.currentData.concat(res.newData);
			} else if (res.mode === "streaming") {
				combineData = helper.combineStreamData(res.currentData, res.newData);
			}
			if (combineData) {
				result = combineData.map((markerData) => {
					const marker = markerData._source;
					return this.props.onData
						?	this.props.onData(markerData)
						: (
							<div className="row" style={{ marginTop: "20px" }}>
								{this.itemMarkup(marker, markerData)}
							</div>
					);
				});
			}
		}
		return result;
	}

	itemMarkup(marker, markerData) {
		return (
			<div
				key={markerData._id}
				style={{ padding: "12px", fontSize: "12px" }}
				className="makerInfo"
			>
				<JsonPrint data={marker} />
			</div>
		);
	}

	nextPage() {
		function start() {
			this.setState({
				isLoading: true
			});
			manager.nextPage(this.channelId);
		}

		if (this.state.resultStats.total > this.state.currentData.length && !this.state.queryStart) {
			start.call(this);
		}
	}

	listComponent() {
		function setScroll(node) {
			if (node) {
				node.addEventListener("scroll", () => {
					const scrollHeight = node.scrollHeight || node.scrollHeight === 0 ? node.scrollHeight : $(node).height();
					if (this.state.requestOnScroll && $(node).scrollTop() + $(node).innerHeight() >= scrollHeight && this.state.resultStats.total > this.state.currentData.length && !this.state.queryStart) {
						this.nextPage();
					}
				});
			}
		}
		if (this.props.scrollOnTarget) {
			setScroll.call(this, this.props.scrollOnTarget);
		} else {
			setScroll.call(this, this.listParentElement);
			setScroll.call(this, this.listChildElement);
		}
	}

	handleSortSelect(event) {
		const index = event.target.value;
		this.sortObj = {
			[this.props.sortOptions[index].appbaseField]: {
				order: this.props.sortOptions[index].sortBy
			}
		};
		const obj = {
			key: this.resultSortKey,
			value: this.sortObj
		};
		helper.selectedSensor.set(obj, true, "sortChange");
	}

	getComponentStyle() {
		let componentStyle = {};
		if(this.props.scrollOnTarget) {
			componentStyle.maxHeight = "none";
			componentStyle.height = "auto";
		}
		componentStyle = Object.assign(componentStyle, this.props.componentStyle);
		return componentStyle;
	}

	render() {
		let title = null,
			placeholder = null,
			sortOptions = null;
		const cx = classNames({
			"rbc-title-active": this.props.title,
			"rbc-title-inactive": !this.props.title,
			"rbc-sort-active": this.props.sortOptions,
			"rbc-sort-inactive": !this.props.sortOptions,
			"rbc-stream-active": this.props.stream,
			"rbc-stream-inactive": !this.props.stream,
			"rbc-placeholder-active": this.props.placeholder,
			"rbc-placeholder-inactive": !this.props.placeholder,
			"rbc-initialloader-active": this.props.initialLoader,
			"rbc-initialloader-inactive": !this.props.initialLoader,
			"rbc-resultstats-active": this.props.showResultStats,
			"rbc-resultstats-inactive": !this.props.showResultStats,
			"rbc-noresults-active": this.props.noResults,
			"rbc-noresults-inactive": !this.props.noResults,
			"rbc-pagination-active": this.props.pagination,
			"rbc-pagination-inactive": !this.props.pagination
		});

		if (this.props.title) {
			title = (<h4 className="rbc-title col s12 col-xs-12">{this.props.title}</h4>);
		}
		if (this.props.placeholder) {
			placeholder = (<div className="rbc-placeholder col s12 col-xs-12">{this.props.placeholder}</div>);
		}

		if (this.props.sortOptions) {
			const options = this.props.sortOptions.map((item, index) => <option value={index} key={item.label}>{item.label}</option>);

			sortOptions = (
				<div className="rbc-sortoptions input-field col">
					<select className="browser-default form-control" onChange={this.handleSortSelect}>
						{options}
					</select>
				</div>
			);
		}

		return (
			<div className="rbc-reactivelist-container">
				<div ref={(div) => { this.listParentElement = div; }} className={`rbc rbc-reactivelist card thumbnail ${cx}`} style={this.getComponentStyle()}>
					{title}
					{sortOptions}
					{this.props.showResultStats && this.state.resultStats.resultFound ? (<ResultStats onResultStats={this.props.onResultStats} took={this.state.resultStats.took} total={this.state.resultStats.total} />) : null}
					{this.paginationAt("top")}
					<div ref={(div) => { this.listChildElement = div; }} className="rbc-reactivelist-scroll-container col s12 col-xs-12">
						{this.state.resultMarkup}
					</div>
					{
						this.state.isLoading ?
							<div className="rbc-loader" /> :
						null
					}
					{this.state.showPlaceholder ? placeholder : null}
					{this.paginationAt("bottom")}
				</div>
				{this.props.noResults && this.state.visibleNoResults ? (<NoResults defaultText={this.props.noResults} />) : null}
				{this.props.initialLoader && this.state.queryStart && this.state.showInitialLoader ? (<InitialLoader defaultText={this.props.initialLoader} />) : null}
				<PoweredBy container="rbc-reactivelist-container" />
			</div>
		);
	}
}

ReactiveList.propTypes = {
	componentId: React.PropTypes.string,
	appbaseField: React.PropTypes.string,
	title: React.PropTypes.oneOfType([
		React.PropTypes.string,
		React.PropTypes.element
	]),
	sortBy: React.PropTypes.oneOf(["asc", "desc", "default"]),
	sortOptions: React.PropTypes.arrayOf(
		React.PropTypes.shape({
			label: React.PropTypes.string,
			appbaseField: React.PropTypes.string,
			sortBy: React.PropTypes.string
		})
	),
	from: helper.validation.resultListFrom,
	onAllData: React.PropTypes.func,
	size: helper.sizeValidation,
	stream: React.PropTypes.bool,
	componentStyle: React.PropTypes.object,
	initialLoader: React.PropTypes.oneOfType([
		React.PropTypes.string,
		React.PropTypes.element
	]),
	noResults: React.PropTypes.oneOfType([
		React.PropTypes.string,
		React.PropTypes.element
	]),
	showResultStats: React.PropTypes.bool,
	onResultStats: React.PropTypes.func,
	placeholder: React.PropTypes.oneOfType([
		React.PropTypes.string,
		React.PropTypes.element
	]),
	react: React.PropTypes.object,
	paginationAt: React.PropTypes.string,
	pagination: React.PropTypes.bool,
	pages: React.PropTypes.number,
	scrollOnTarget: React.PropTypes.object
};

ReactiveList.defaultProps = {
	from: 0,
	size: 20,
	stream: false,
	componentStyle: {},
	showResultStats: true,
	pagination: false,
	paginationAt: "bottom",
	pages: 5
};

// context type
ReactiveList.contextTypes = {
	appbaseRef: React.PropTypes.any.isRequired,
	type: React.PropTypes.any.isRequired,
	app: React.PropTypes.any.isRequired,
	appbaseCrdentials: React.PropTypes.any.isRequired
};

ReactiveList.types = {
	componentId: TYPES.STRING,
	appbaseField: TYPES.STRING,
	title: TYPES.STRING,
	react: TYPES.OBJECT,
	sortBy: TYPES.STRING,
	sortOptions: TYPES.OBJECT,
	from: TYPES.NUMBER,
	onAllData: TYPES.FUNCTION,
	onData: TYPES.FUNCTION,
	size: TYPES.NUMBER,
	stream: TYPES.BOOLEAN,
	componentStyle: TYPES.OBJECT,
	initialLoader: TYPES.STRING,
	noResults: TYPES.FUNCTION,
	showResultStats: TYPES.BOOLEAN,
	onResultStats: TYPES.FUNCTION,
	placeholder: TYPES.STRING,
	pagination: TYPES.BOOLEAN,
	paginationAt: TYPES.STRING,
	pages: TYPES.NUMBER,
	scrollOnTarget: TYPES.OBJECT
};
