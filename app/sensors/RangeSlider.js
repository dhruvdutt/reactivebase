import { default as React, Component } from 'react';
import classNames from 'classnames';
import { manager } from '../middleware/ChannelManager.js';
import { HistoGramComponent } from './component/HistoGram.js';
import Slider from 'rc-slider';
var helper = require('../middleware/helper.js');
var _ = require('lodash');

export class RangeSlider extends Component {
	constructor(props, context) {
		super(props);
		let startThreshold = this.props.range.start ? this.props.range.start : 0;
		let endThreshold = this.props.range.end ? this.props.range.end : 5;
		let values = {};
		values.min = this.props.defaultSelected.start < startThreshold ? startThreshold : this.props.defaultSelected.start;
		values.max = this.props.defaultSelected.end < endThreshold ? this.props.defaultSelected.end :  endThreshold;
		this.state = {
			values: values,
			startThreshold: startThreshold,
			endThreshold: endThreshold,
			currentValues: [],
			counts: [],
			rawData: {
				hits: {
					hits: []
				}
			}
		};
		this.type = 'range';
		this.channelId = null;
		this.channelListener = null;
		this.handleValuesChange = this.handleValuesChange.bind(this);
		this.handleResults = this.handleResults.bind(this);
	}

	// Get the items from Appbase when component is mounted
	componentDidMount() {
		this.setQueryInfo();
		this.createChannel();
	}

	// stop streaming request and remove listener when component will unmount
	componentWillUnmount() {
		if(this.channelId) {
			manager.stopStream(this.channelId);
		}
		if(this.channelListener) {
			this.channelListener.remove();
		}
	}

	componentWillReceiveProps(nextProps) {
		setTimeout(() => {
			if (nextProps.defaultSelected.start !== this.state.values.min ||
				nextProps.defaultSelected.end !== this.state.values.max &&
				nextProps.range.start <= nextProps.defaultSelected.start &&
				nextProps.range.end >= nextProps.defaultSelected.end) {
				let values = {};
				values.min = nextProps.defaultSelected.start;
				values.max = nextProps.defaultSelected.end;
				this.setState({
					values: values,
					currentValues: values
				});
				var obj = {
					key: this.props.componentId,
					value: {
						from: values.min,
						to: values.max
					}
				};
				helper.selectedSensor.set(obj, true);
			}
			else if (nextProps.range.start !== this.state.startThreshold ||
					 nextProps.range.end !== this.state.endThreshold ) {
				if (nextProps.range.start <= this.state.values.min &&
					nextProps.range.end >= this.state.values.max) {
					this.setState({
						startThreshold: nextProps.range.start,
						endThreshold: nextProps.range.end
					});
				} else {
					let values = {
						min: this.state.values.min,
						max: this.state.values.max
					};
					if (this.state.values.min < nextProps.range.start) {
						values.min = nextProps.range.start;
					}
					if (this.state.values.max > nextProps.range.end) {
						values.max = nextProps.range.end;
					}
					this.setState({
						startThreshold: nextProps.range.start,
						endThreshold: nextProps.range.end,
						values: values
					});
					var obj = {
						key: this.props.componentId,
						value: {
							from: values.min,
							to: values.max
						}
					};
					helper.selectedSensor.set(obj, true);
				}
			}
			else {
				let rem = (nextProps.defaultSelected.end - nextProps.defaultSelected.start) % nextProps.stepValue;
				if (rem) {
					this.setState({
						values: {
							min: this.state.values.min,
							max: nextProps.defaultSelected.end - rem
						}
					});
					var obj = {
						key: this.props.componentId,
						value: {
							from: this.state.values.min,
							to: nextProps.defaultSelected.end - rem
						}
					};
					helper.selectedSensor.set(obj, true);
				}
			}
		}, 300);
	}

	shouldComponentUpdate(nextProps, nextState) {
		if ((nextProps.stepValue <= 0) ||
			(nextProps.stepValue > Math.floor((nextProps['range']['end'] - nextProps['range']['start'])/2))) {
			return false;
		} else {
			return true;
		}
	}

	// Handle function when value slider option is changing
	handleValuesChange(component, values) {
		this.setState({
			values: values
		});
	}

	// set the query type and input data
	setQueryInfo() {
		var obj = {
				key: this.props.componentId,
				value: {
					queryType: this.type,
					inputData: this.props.appbaseField
				}
		};
		helper.selectedSensor.setSensorInfo(obj);
	}

	// Create a channel which passes the actuate and receive results whenever actuate changes
	createChannel() {
		// Set the actuate - add self aggs query as well with actuate
		let actuate = this.props.actuate ? this.props.actuate : {};
		actuate['aggs'] = {
			key: this.props.appbaseField,
			sort: this.props.sort,
			size: this.props.size
		};
		// create a channel and listen the changes
		var channelObj = manager.create(this.context.appbaseRef, this.context.type, actuate);
		this.channelId = channelObj.channelId;
		this.channelListener = channelObj.emitter.addListener(channelObj.channelId, function(res) {
			let data = res.data;
			let rawData;
			if(res.mode === 'streaming') {
				rawData = this.state.rawData;
				rawData.hits.hits.push(res.data);
			} else if(res.mode === 'historic') {
				rawData = data;
			}
			this.setState({
				rawData: rawData
			});
			this.setData(data);
		}.bind(this));
	}

	setData(data) {
		try {
			this.addItemsToList(eval(`data.aggregations["${this.props.appbaseField}"].buckets`));
		} catch(e) {
			console.log(e);
		}
	}

	addItemsToList(newItems) {
		newItems = _.orderBy(newItems, ['key'], ['asc']);
		let itemLength = newItems.length;
		let min = this.state.startThreshold ? this.state.startThreshold : newItems[0].key;
		let max = this.state.endThreshold ? this.state.endThreshold : newItems[itemLength-1].key;
		if(itemLength > 1) {
			let rangeValue = {
				counts: this.countCalc(min, max, newItems),
				startThreshold: min,
				endThreshold: max,
				values: {
					min: this.state.values.min,
					max: this.state.values.max
				}
			};
			this.setState(rangeValue, function() {
				this.handleResults(null, rangeValue.values);
			}.bind(this));
		}
	}

	countCalc(min, max, newItems) {
		let counts = [];
		for(let i = min; i <= max; i++) {
			let item = _.find(newItems, {'key': i});
			let val =  item ? item.doc_count : 0;
			counts.push(val);
		}
		return counts;
	}

	// Handle function when slider option change is completed
	handleResults(textVal, value) {
		let values;
		if(textVal) {
			values = {
				min: textVal[0],
				max: textVal[1]
			};
		} else {
			values = value;
		}
		var real_values = {
			from: values.min,
			to: values.max
		}
		var obj = {
			key: this.props.componentId,
			value: real_values
		};
		helper.selectedSensor.set(obj, true);
		this.setState({
			currentValues: values,
			values: values
		});
	}

	render() {
		let title = null,
			histogram = null;

		if(this.props.title) {
			title = (<h4 className="rbc-title col s12 col-xs-12">{this.props.title}</h4>);
		}
		if(this.state.counts && this.state.counts.length) {
			histogram = (<HistoGramComponent data={this.state.counts} />);
		}

		let cx = classNames({
			'rbc-title-active': this.props.title,
			'rbc-title-inactive': !this.props.title
		});

		return (
			<div className={`rbc rbc-rangeslider card thumbnail col s12 col-xs-12 ${cx}`}>
				{title}
				{histogram}
				<div className="rbc-rangeslider-container col s12 col-xs-12" style={{'margin': '25px 0'}}>
					<Slider range
						value={[this.state.values.min, this.state.values.max]}
						min={this.state.startThreshold}
						max={this.state.endThreshold}
						onChange={this.handleResults}
						step={this.props.stepValue}
					/>
				</div>
			</div>
		);
	}
}

RangeSlider.propTypes = {
	componentId: React.PropTypes.string.isRequired,
	appbaseField: React.PropTypes.string.isRequired,
	range: React.PropTypes.shape({
		start: helper.validateThreshold,
		end: helper.validateThreshold
	}),
	defaultSelected: React.PropTypes.object,
	stepValue: helper.stepValidation
};

RangeSlider.defaultProps = {
	defaultSelected: {
		start: 0,
		end: 10
	},
	range: {
		start: 0,
		end: 10
	},
	stepValue: 1,
	size: 100,
	title: null
};

// context type
RangeSlider.contextTypes = {
	appbaseRef: React.PropTypes.any.isRequired,
	type: React.PropTypes.any.isRequired
};
