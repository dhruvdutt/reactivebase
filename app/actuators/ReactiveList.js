import {default as React, Component} from 'react';
import classNames from 'classnames';
import { manager } from '../middleware/ChannelManager.js';
import JsonPrint from './component/JsonPrint';
import { PoweredBy } from '../sensors/PoweredBy';
var helper = require('../middleware/helper.js');
var $ = require('jquery');
var _ = require('lodash');

export class ReactiveList extends Component {
	constructor(props, context) {
		super(props);
		this.state = {
			markers: [],
			query: {},
			currentData:  [],
			resultMarkup: [],
			isLoading: false
		};
		if (this.props.sortOptions) {
			let obj = this.props.sortOptions[0];
			this.sortObj = {
				[obj.appbaseField]: {
					order: obj.sortBy
				}
			}
		} else if (this.props.sortBy) {
			this.sortObj = {
				[this.props.appbaseField] : {
					order: this.props.sortBy
				}
			};
		}
		this.resultSortKey = 'ResultSort';
		this.channelId = null;
		this.channelListener = null;
		this.queryStartTime = 0;
		this.handleSortSelect = this.handleSortSelect.bind(this);
		this.nextPage = this.nextPage.bind(this);
		this.appliedQuery = {};
	}

	componentDidMount() {
		this.streamProp = this.props.stream;
		this.requestOnScroll = this.props.requestOnScroll;
		this.initialize();
	}

	initialize() {
		this.createChannel();
		if (this.props.requestOnScroll) {
			this.listComponent();
		}
	}

	componentWillUpdate() {
		setTimeout(() => {
			if (this.streamProp != this.props.stream) {
				this.streamProp = this.props.stream;
				this.removeChannel();
				this.initialize();
			}
			if (this.requestOnScroll != this.props.requestOnScroll) {
				this.requestOnScroll = this.props.requestOnScroll;
				this.listComponent();
			}
		}, 300);
	}

	// stop streaming request and remove listener when component will unmount
	componentWillUnmount() {
		this.removeChannel();
	}

	removeChannel() {
		if(this.channelId) {
			manager.stopStream(this.channelId);
			this.channelId = null;
		}
		if(this.channelListener) {
			this.channelListener.remove();
		}
	}

	// Create a channel which passes the react and receive results whenever react changes
	createChannel() {
		// Set the react - add self aggs query as well with react
		let react = this.props.react ? this.props.react : {};
		if(react && react.and && typeof react.and === 'string') {
			react.and = [react.and];
		}
		react.and.push('streamChanges');
		if (this.sortObj) {
			this.enableSort(react);
		}
		// create a channel and listen the changes
		var channelObj = manager.create(this.context.appbaseRef, this.context.type, react, this.props.size, this.props.from, this.props.stream);
		this.channelId = channelObj.channelId;

		this.channelListener = channelObj.emitter.addListener(channelObj.channelId, function(res) {
			// implementation to prevent initialize query issue if old query response is late then the newer query
			// then we will consider the response of new query and prevent to apply changes for old query response.
			// if queryStartTime of channel response is greater than the previous one only then apply changes
			if(res.error && res.startTime > this.queryStartTime) {
				if(this.props.onData) {
					let modifiedData = helper.prepareResultData(data);
					this.props.onData(modifiedData);
				}
			}
			if(res.mode === 'historic' && res.startTime > this.queryStartTime) {
				this.afterChannelResponse(res);
			} else if(res.mode === 'streaming') {
				this.afterChannelResponse(res);
			}
		}.bind(this));
		var obj = {
			key: 'streamChanges',
			value: ''
		};
		helper.selectedSensor.set(obj, true);
	}

	afterChannelResponse(res) {
		let data = res.data;
		let rawData, markersData, newData = [], currentData = [];
		this.streamFlag = false;
		if (res.mode === 'streaming') {
			this.channelMethod = 'streaming';
			newData = res.data;
			newData.stream = true;
			currentData = this.state.currentData;
			this.streamFlag = true;
			markersData = this.setMarkersData(rawData);
		} else if (res.mode === 'historic') {
			this.queryStartTime = res.startTime;
			this.channelMethod = 'historic';
			newData = res.data.hits && res.data.hits.hits ? res.data.hits.hits : [];
			let normalizeCurrentData = this.normalizeCurrentData(res, this.state.currentData, newData);
			newData = normalizeCurrentData.newData;
			currentData = normalizeCurrentData.currentData;
		}
		this.setState({
			rawData: rawData,
			newData: newData,
			currentData: currentData,
			markersData: markersData,
			isLoading: false
		}, function() {
			// Pass the historic or streaming data in index method
			res.allMarkers = rawData;
			let modifiedData = JSON.parse(JSON.stringify(res));
			modifiedData.newData = this.state.newData;
			modifiedData.currentData = this.state.currentData;
			delete modifiedData.data;
			modifiedData = helper.prepareResultData(modifiedData, res.data);
			let generatedData = this.props.onData ? this.props.onData(modifiedData) : this.defaultonData(modifiedData);
			this.setState({
				resultMarkup: this.wrapMarkup(generatedData),
				currentData: this.combineCurrentData(newData)
			});
			if (this.streamFlag) {
				this.streamMarkerInterval();
			}
		}.bind(this));
	}

	wrapMarkup(generatedData) {
		if(Object.prototype.toString.call(generatedData) === '[object Array]' ) {
			return generatedData.map((item, index) => {
				return (<div key={index} className="rbc-list-item">{item}</div>);
			});
		} else {
			return generatedData;
		}
	}

	// Check if stream data exists in markersData
	// and if exists the call streamToNormal.
	streamMarkerInterval() {
		let markersData = this.state.markersData;
		let isStreamData = markersData.filter((hit) => hit.stream && hit.streamStart);
		if(isStreamData.length) {
			this.isStreamDataExists = true;
			setTimeout(() => this.streamToNormal(), this.props.streamActiveTime*1000);
		} else {
			this.isStreamDataExists = false;
		}
	}

	// Check the difference between current time and attached stream time
	// if difference is equal to streamActiveTime then delete stream and starStream property of marker
	streamToNormal() {
		let markersData = this.state.markersData;
		let isStreamData = markersData.filter((hit) => hit.stream && hit.streamStart);
		if(isStreamData.length) {
			markersData = markersData.map((hit, index) => {
				if(hit.stream && hit.streamStart) {
					let currentTime = new Date();
					let timeDiff = (currentTime.getTime() - hit.streamStart.getTime())/1000;
					if(timeDiff >= this.props.streamActiveTime) {
						delete hit.stream;
						delete hit.streamStart;
					}
				}
				return hit;
			});
			this.setState({
				markersData: markersData
			});
		} else {
			this.isStreamDataExists = false;
		}
	}

	// normalize current data
	normalizeCurrentData(res, rawData, newData) {
		let appliedQuery = JSON.parse(JSON.stringify(res.appliedQuery));
		if(this.props.requestOnScroll && appliedQuery && appliedQuery.body) {
			delete appliedQuery.body.from;
			delete appliedQuery.body.size;
		}
		let currentData = JSON.stringify(appliedQuery) === JSON.stringify(this.appliedQuery) ? (rawData ? rawData : []) : [];
		if(!currentData.length) {
			this.appliedQuery = appliedQuery;
		} else {
			newData = newData.filter((newRecord) => {
				let notExits = true;
				currentData.forEach((oldRecord) => {
					if(newRecord._id+'-'+newRecord._type === oldRecord._id+'-'+oldRecord._type) {
						notExits = false;
					}
				});
				return notExits;
			});
		}
		return {
			currentData: currentData,
			newData: newData
		};
	}

	combineCurrentData(newData) {
		if(_.isArray(newData)) {
			return this.state.currentData.concat(newData);
		} else {
			return this.streamDataModify(this.state.currentData, newData)
		}
	}

	// enable sort
	enableSort(react) {
		react.and.push(this.resultSortKey);
		let sortObj = {
			key: this.resultSortKey,
			value: this.sortObj
		};
		helper.selectedSensor.setSortInfo(sortObj);
	}

	// append data if pagination is applied
	appendData(data) {
		let rawData = this.state.rawData;
		let hits = rawData.hits.hits.concat(data.hits.hits);
		rawData.hits.hits = _.uniqBy(hits, '_id');;
		return rawData;
	}

	// append stream boolean flag and also start time of stream
	streamDataModify(rawData, data) {
		if (data) {
			data.stream = true;
			data.streamStart = new Date();
			if (data._deleted) {
				let hits = rawData.filter((hit) => {
					return hit._id !== data._id;
				});
				rawData = hits;
			} else {
				let prevData = rawData.filter((hit) => {
					return hit._id === data._id;
				});
				let hits = rawData.filter((hit) => {
					return hit._id !== data._id;
				});
				rawData = hits;
				rawData.unshift(data);
			}
		}
		return rawData;
	}

	// tranform the raw data to marker data
	setMarkersData(hits) {
		var self = this;
		if (hits) {
			return hits;
		} else {
			return [];
		}
	}

	defaultonData(response) {
		let res = response.res;
		let result = null;
		if(res) {
			let combineData = res.currentData;
			if(res.mode === 'historic') {
				combineData = res.currentData.concat(res.newData);
			}
			else if(res.mode === 'streaming') {
				combineData = helper.combineStreamData(res.currentData, res.newData);
			}
			if (combineData) {
				result = combineData.map((markerData, index) => {
					let marker = markerData._source;
					return (
						<div className="row" style={{'marginTop': '60px'}}>
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
				style={{'borderBottom': '1px solid #eee', 'padding': '12px', 'fontSize': '12px'}}
				className="makerInfo">
					<JsonPrint data={marker} />
			</div>
		);
	}

	nextPage() {
		this.setState({
			isLoading: true
		});
		let channelOptionsObj = manager.channels[this.channelId].previousSelectedSensor['channel-options-' + this.channelId];
		let obj = {
			key: 'channel-options-' + this.channelId,
			value: {
				size: this.props.size,
				from: channelOptionsObj.from + this.props.size
			}
		};
		manager.nextPage(this.channelId);
	}

	listComponent() {
		let node = this.refs.ListContainer;
		if (node) {
			node.addEventListener('scroll', () => {
				if (this.props.requestOnScroll && $(node).scrollTop() + $(node).innerHeight() >= node.scrollHeight) {
					this.nextPage();
				}
			});
		}
	}

	handleSortSelect(event) {
		let index = event.target.value;
		this.sortObj = {
			[this.props.sortOptions[index]['appbaseField']]: {
				order: this.props.sortOptions[index]['sortBy']
			}
		};
		let obj = {
			key: this.resultSortKey,
			value: this.sortObj
		};
		helper.selectedSensor.set(obj, true, 'sortChange');
	}

	render() {
		let title = null, sortOptions = null;
		let cx = classNames({
			'rbc-title-active': this.props.title,
			'rbc-title-inactive': !this.props.title,
			'rbc-sort-active': this.props.sortOptions,
			'rbc-sort-inactive': !this.props.sortOptions,
			'rbc-stream-active': this.props.stream,
			'rbc-stream-inactive': !this.props.stream
		});

		if(this.props.title) {
			title = (<h4 className="rbc-title col s12 col-xs-12">{this.props.title}</h4>);
		}

		if (this.props.sortOptions) {
			let options = this.props.sortOptions.map((item, index) => {
				return <option value={index} key={index}>{item.label}</option>;
			});

			sortOptions = (
				<div className="rbc-sortoptions input-field col">
					<select className="browser-default form-control" onChange={this.handleSortSelect}>
						{options}
					</select>
				</div>
			)
		}

		return (
			<div className="rbc-resultlist-container">
				<div ref="ListContainer" className={`rbc rbc-resultlist card thumbnail ${cx}`} style={this.props.componentStyle}>
					{title}
					{sortOptions}
					{this.state.resultMarkup}
					{
						this.state.isLoading ?
						<div className="rbc-loader"></div> :
						null
					}
				</div >
				<PoweredBy></PoweredBy>
			</div>
		)
	}
}

ReactiveList.propTypes = {
	componentId: React.PropTypes.string,
	appbaseField: React.PropTypes.string,
	title: React.PropTypes.string,
	sortBy: React.PropTypes.oneOf(['asc', 'desc']),
	sortOptions: React.PropTypes.arrayOf(
		React.PropTypes.shape({
			label: React.PropTypes.string,
			field: React.PropTypes.string,
			order: React.PropTypes.string,
		})
	),
	from: helper.validation.resultListFrom,
	onData: React.PropTypes.func,
	size: helper.sizeValidation,
	requestOnScroll: React.PropTypes.bool,
	stream: React.PropTypes.bool,
	componentStyle: React.PropTypes.object
};

ReactiveList.defaultProps = {
	from: 0,
	size: 20,
	requestOnScroll: true,
	stream: false,
	componentStyle: {}
};

// context type
ReactiveList.contextTypes = {
	appbaseRef: React.PropTypes.any.isRequired,
	type: React.PropTypes.any.isRequired
};