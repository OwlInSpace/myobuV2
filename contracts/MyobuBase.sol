// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./Utils/MyobuLib.sol";
import "./Utils/Ownable.sol";
import "./Interfaces/IUniswapV2Router.sol";
import "./Interfaces/IUniswapV2Factory.sol";
import "./Interfaces/IUniswapV2Pair.sol";
import "./Interfaces/IMyobu.sol";

// import "hardhat/console.sol";

// solhint-disable max-states-count
abstract contract MyobuBase is IMyobu, Ownable {
    uint256 internal constant MAX = type(uint256).max;
    // solhint-disable-next-line
    uint256 private constant _tTotal = 1000000000000 * 10**9;

    string internal constant NAME = unicode"Myōbu";
    string internal constant SYMBOL = "MYOBU";
    uint8 internal constant DECIMALS = 9;

    mapping(address => uint256) private _rOwned;
    mapping(address => uint256) private _tOwned;

    // pair => router
    mapping(address => address) internal _routerFor;

    mapping(address => bool) private taxedTransfer;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _rTotal = (MAX - (MAX % _tTotal));
    uint256 private _tFeeTotal;

    // Should not be set, used to store the fee that will be taken
    uint256 private _teamFee;

    Fees private fees;

    address payable internal _taxAddress;

    IUniswapV2Router internal uniswapV2Router;
    address internal uniswapV2Pair;

    bool private tradingOpen = false;
    bool private liquidityAdded = false;
    bool private inSwap = false;
    bool private swapEnabled = false;

    modifier lockTheSwap() {
        inSwap = true;
        _;
        inSwap = false;
    }

    constructor(address payable addr1) {
        _taxAddress = addr1;
        _rOwned[_msgSender()] = _rTotal;
        emit Transfer(address(0), _msgSender(), _tTotal);
    }

    function name() public pure virtual returns (string memory) {
        return NAME;
    }

    function taxedPair(address pair)
        public
        view
        virtual
        override
        returns (bool)
    {
        return _routerFor[pair] != address(0);
    }

    function symbol() public pure virtual returns (string memory) {
        return SYMBOL;
    }

    function decimals() public pure virtual returns (uint8) {
        return DECIMALS;
    }

    function totalSupply() public pure virtual override returns (uint256) {
        return _tTotal;
    }

    function balanceOf(address account)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return tokenFromReflection(_rOwned[account]);
    }

    function transfer(address recipient, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender)
        public
        view
        override
        returns (uint256)
    {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount)
        public
        virtual
        override
        returns (bool)
    {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) private {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(
            sender,
            _msgSender(),
            _allowances[sender][_msgSender()] - amount
        );
        return true;
    }

    function tokenFromReflection(uint256 rAmount)
        private
        view
        returns (uint256)
    {
        require(
            rAmount <= _rTotal,
            "Amount must be less than total reflections"
        );
        uint256 currentRate = _getRate();
        return rAmount / currentRate;
    }

    function removeAllFee() private {
        if (fees.taxFee == 0 && _teamFee == 0) return;
        fees.taxFee = 0;
        _teamFee = 0;
    }

    function restoreAllFee(uint256 rfi) private {
        fees.taxFee = rfi;
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal {
        require(amount > 0, "Transfer amount must be greater than zero");

        bool takeFee = false;

        if (from != owner() && to != owner()) {
            if (swapEnabled && !inSwap) {
                if (taxedPair(from) && !taxedPair(to)) {
                    require(tradingOpen);
                    _teamFee = fees.buyFee;
                    takeFee = true;
                } else if (taxedTransfer[from] || taxedTransfer[to]) {
                    _teamFee = fees.transferFee;
                    takeFee = true;
                } else if (taxedPair(to)) {
                    require(tradingOpen);
                    require(amount <= (balanceOf(to) * fees.impact) / 100);
                    uint256 contractTokenBalance = balanceOf(address(this));
                    swapTokensForEth(contractTokenBalance);
                    sendETHToFee(address(this).balance);
                    _teamFee = fees.sellFee;
                    takeFee = true;
                }
            }
        }

        _tokenTransfer(from, to, amount, takeFee);
    }

    function swapTokensForEth(uint256 tokenAmount) internal lockTheSwap {
        MyobuLib.swapForETH(uniswapV2Router, tokenAmount, address(this));
    }

    function sendETHToFee(uint256 amount) internal {
        _taxAddress.transfer(amount);
    }

    function openTrading() public virtual onlyOwner {
        require(liquidityAdded);
        tradingOpen = true;
    }

    function addDEX(address pair, address router) public virtual onlyOwner {
        require(!taxedPair(pair), "DEX already exists");
        address tokenFor = MyobuLib.tokenFor(pair);
        _routerFor[pair] = router;
        _approve(address(this), router, MAX);
        IERC20(tokenFor).approve(router, MAX);
        IERC20(pair).approve(router, MAX);
    }

    function removeDEX(address pair) public virtual onlyOwner {
        require(taxedPair(pair), "DEX does not exist");
        address tokenFor = MyobuLib.tokenFor(pair);
        address router = _routerFor[pair];
        delete _routerFor[pair];
        _approve(address(this), router, 0);
        IERC20(tokenFor).approve(router, 0);
        IERC20(pair).approve(router, 0);
    }

    function addLiquidity() external virtual onlyOwner lockTheSwap {
        IUniswapV2Router _uniswapV2Router = IUniswapV2Router(
            0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
        );
        uniswapV2Router = _uniswapV2Router;
        uniswapV2Pair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), _uniswapV2Router.WETH());
        addDEX(uniswapV2Pair, address(_uniswapV2Router));
        MyobuLib.addLiquidityETH(
            uniswapV2Router,
            balanceOf(address(this)),
            address(this).balance,
            owner()
        );
        liquidityAdded = true;
    }

    function setTaxAddress(address payable newTaxAddress) external onlyOwner {
        _taxAddress = newTaxAddress;
        emit TaxAddressChanged(newTaxAddress);
    }

    function setTaxedTransferFor(address[] calldata taxedTransfer_)
        external
        virtual
        onlyOwner
    {
        for (uint256 i; i < taxedTransfer_.length; i++) {
            taxedTransfer[taxedTransfer_[i]] = true;
        }
        emit TaxedTransferAddedFor(taxedTransfer_);
    }

    function removeTaxedTransferFor(address[] calldata notTaxed)
        external
        virtual
        onlyOwner
    {
        for (uint256 i; i < notTaxed.length; i++) {
            taxedTransfer[notTaxed[i]] = false;
        }
        emit TaxedTransferRemovedFor(notTaxed);
    }

    function manualswap() external onlyOwner {
        uint256 contractBalance = balanceOf(address(this));
        swapTokensForEth(contractBalance);
    }

    function manualsend() external onlyOwner {
        uint256 contractETHBalance = address(this).balance;
        sendETHToFee(contractETHBalance);
    }

    function _tokenTransfer(
        address sender,
        address recipient,
        uint256 amount,
        bool takeFee
    ) private {
        uint256 rfi = fees.taxFee;
        if (!takeFee) removeAllFee();
        _transferStandard(sender, recipient, amount);
        if (!takeFee) restoreAllFee(rfi);
    }

    function _transferStandard(
        address sender,
        address recipient,
        uint256 tAmount
    ) private {
        (
            uint256 rAmount,
            uint256 rTransferAmount,
            uint256 rFee,
            uint256 tTransferAmount,
            uint256 tFee,
            uint256 tTeam
        ) = _getValues(tAmount);
        _beforeTokenTransfer(sender, recipient, tTransferAmount);
        _rOwned[sender] -= rAmount;
        _rOwned[recipient] += rTransferAmount;
        _takeTeam(tTeam);
        _reflectFee(rFee, tFee);
        emit Transfer(sender, recipient, tTransferAmount);
        emit FeesTaken(tTeam, tFee);
    }

    function _takeTeam(uint256 tTeam) private {
        uint256 currentRate = _getRate();
        uint256 rTeam = tTeam * currentRate;
        _rOwned[address(this)] += rTeam;
    }

    function _reflectFee(uint256 rFee, uint256 tFee) private {
        _rTotal -= rFee;
        _tFeeTotal += tFee;
    }

    // solhint-disable-next-line
    receive() external payable virtual {}

    function _getValues(uint256 tAmount)
        private
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        (uint256 tTransferAmount, uint256 tFee, uint256 tTeam) = _getTValues(
            tAmount,
            fees.taxFee,
            _teamFee
        );
        uint256 currentRate = _getRate();
        (uint256 rAmount, uint256 rTransferAmount, uint256 rFee) = _getRValues(
            tAmount,
            tFee,
            tTeam,
            currentRate
        );
        return (rAmount, rTransferAmount, rFee, tTransferAmount, tFee, tTeam);
    }

    function _getTValues(
        uint256 tAmount,
        uint256 taxFee,
        uint256 teamFee
    )
        private
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 tFee = MyobuLib.percentageOf(tAmount, taxFee);
        uint256 tTeam = MyobuLib.percentageOf(tAmount, teamFee);
        uint256 tTransferAmount = tAmount - tFee - tTeam;
        return (tTransferAmount, tFee, tTeam);
    }

    function _getRValues(
        uint256 tAmount,
        uint256 tFee,
        uint256 tTeam,
        uint256 currentRate
    )
        private
        pure
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 rAmount = tAmount * currentRate;
        uint256 rFee = tFee * currentRate;
        uint256 rTeam = tTeam * currentRate;
        uint256 rTransferAmount = rAmount - rFee - rTeam;
        return (rAmount, rTransferAmount, rFee);
    }

    function _getRate() private view returns (uint256) {
        (uint256 rSupply, uint256 tSupply) = _getCurrentSupply();
        return rSupply / tSupply;
    }

    function _getCurrentSupply() private view returns (uint256, uint256) {
        uint256 rSupply = _rTotal;
        uint256 tSupply = _tTotal;
        if (rSupply < _rTotal / _tTotal) return (_rTotal, _tTotal);
        return (rSupply, tSupply);
    }

    function setFees(Fees memory newFees) public onlyOwner {
        require(
            newFees.impact != 0 && newFees.impact <= 100,
            "Impact must be greater than 0 and under or equal to 100"
        );
        require(
            newFees.taxFee + newFees.buyFee < 50 &&
                newFees.taxFee + newFees.sellFee < 50 &&
                newFees.transferFee <= newFees.sellFee,
            "Total fees for a buy / sell must be under 50"
        );
        fees = newFees;
        swapEnabled = true;
        if (newFees.buyFee + newFees.sellFee + newFees.transferFee == 0) {
            swapEnabled = false;
        }
        emit FeesChanged(newFees);
    }

    function currentFees() external view override returns (Fees memory) {
        return fees;
    }

    function _beforeTokenTransfer(
        address,
        address,
        uint256
    ) internal virtual {} // solhint-disable-line no-empty-blocks
}
