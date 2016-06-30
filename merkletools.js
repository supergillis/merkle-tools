/*jslint node: true */
'use strict';

var crypto = require('crypto');

var MerkleTools = function (treeOptions) {
    // in case 'new' was omitted
    if (!(this instanceof MerkleTools)) {
        return new MerkleTools(treeOptions);
    }

    var hashType = 'sha256';
    if (treeOptions) { //if tree options were supplied, then process them

        if (treeOptions.hashType !== undefined) { // set the hash function to the user's choice
            hashType = treeOptions.hashType;
        }
    }
    var hashFunction = function (value) {
        return crypto.createHash(hashType).update(value).digest();
    };
    var tree = {};
    tree.leaves = [];
    tree.levels = [];
    tree.isReady = false;

    ////////////////////////////////////////////
    // Public Primary functions
    ////////////////////////////////////////////

    // Resets the current tree to empty
    this.resetTree = function () {
        tree = {};
        tree.leaves = [];
        tree.levels = [];
        tree.isReady = false;
    };

    // Add a leaf to the tree
    // Accepts hash value as a Buffer or hex string
    this.addLeaf = function (value, doHash) {
        tree.isReady = false;
        if (doHash) value = hashFunction(value);
        tree.leaves.push(_getBuffer(value));
    };

    // Add a leaves to the tree
    // Accepts hash values as an array of Buffers or hex strings
    this.addLeaves = function (valuesArray, doHash) {
        tree.isReady = false;
        valuesArray.forEach(function (value) {
            if (doHash) value = hashFunction(value);
            tree.leaves.push(_getBuffer(value));
        });
    };

    // Returns a leaf at the given index
    this.getLeaf = function (index) {
        var leafLevelIndex = tree.levels.length - 1;
        if (index < 0 || index > tree.levels[leafLevelIndex].length - 1) return null; // index is out of array bounds

        return tree.levels[leafLevelIndex][index];
    };

    // Returns the number of leaves added to the tree
    this.getLeafCount = function () {
        return tree.leaves.length;
    };

    // Returns the ready state of the tree
    this.getTreeReadyState = function () {
        return tree.isReady;
    };

    // Generates the merkle tree 
    this.makeTree = function () {
        tree.isReady = false;
        var leafCount = tree.leaves.length;
        if (leafCount > 0) { // skip this whole process if there are no leaves added to the tree
            var levelCount = Math.ceil(Math.log2(leafCount)) + 1;
            tree.levels.unshift(tree.leaves);
            while (tree.levels[0].length > 1) {
                tree.levels.unshift(_calculateNextLevel());
            }
        }
        tree.isReady = true;
    };

    // Returns the merkle root value for the tree
    this.getMerkleRoot = function () {
        if (!tree.isReady) return null;
        return tree.levels[0][0];
    };

    // Returns the proof for a leaf at the given index as an array of merkle siblings in hex format
    this.getProof = function (index) {
        if (!tree.isReady) return null;
        var currentRowIndex = tree.levels.length - 1;
        if (index < 0 || index > tree.levels[currentRowIndex].length - 1) return null; // the index it out of the bounds of the leaf array

        var proof = [];
        for (var x = currentRowIndex; x > 0; x--) {

            var currentLevelNodeCount = tree.levels[x].length;
            // skip if this is an odd end node
            if (index == currentLevelNodeCount - 1 && currentLevelNodeCount % 2 == 1) {
                index = Math.floor(index / 2);
                continue;
            }

            // determine the sibling for the current index and get its value
            var isRightNode = index % 2;
            var siblingIndex = isRightNode ? (index - 1) : (index + 1);
            var sibling = {};
            var siblingPosition = isRightNode ? 'left' : 'right';
            var siblingValue = tree.levels[x][siblingIndex].toString('hex');
            sibling[siblingPosition] = siblingValue;

            proof.push(sibling);

            index = Math.floor(index / 2); // set index to the parent index
        }

        return proof;
    };

    // Takes a proof array, a target hash value, and a merkle root
    // Checks the validity of the proof and return true or false
    this.validateProof = function (proof, targetHash, merkleRoot) {
        targetHash = _getBuffer(targetHash);
        merkleRoot = _getBuffer(merkleRoot);
        if (proof.length === 0) return targetHash.toString('hex') == merkleRoot.toString('hex'); // no siblings, single item tree, so the hash should also be the root

        var proofHash = targetHash;
        for (var x = 0; x < proof.length; x++) {
            if (proof[x].left === undefined) { // then the sibling is a right node
                proofHash = hashFunction(Buffer.concat([proofHash, _getBuffer(proof[x].right)]));
            } else { // the sibling is a left node
                proofHash = hashFunction(Buffer.concat([_getBuffer(proof[x].left), proofHash]));
            }
        }

        return proofHash.toString('hex') == merkleRoot.toString('hex');
    };

    //////////////////////////////////////////
    // Private Utility functions
    //////////////////////////////////////////

    // Internally, trees are made of nodes containing Buffer values only
    // This helps ensure that leaves being added are Buffers, and will convert hex to Buffer if needed
    function _getBuffer(value) {
        if (value instanceof Buffer) { // we already have a buffer, so return it
            return value;
        } else if (_isHex(value)) { // the value is a hex string, convert to buffer and return
            return new Buffer(value, 'hex');
        } else { // the value is neither buffer nor hex string, will not process this, throw error
            throw new Error("Bad hex value - '" + value + "'");
        }
    }

    function _isHex(value) { 
        var hexRegex = /^[0-9A-Fa-f]{2,}$/;
        return hexRegex.test(value);
    }

    // Calculates the next level of node when building the merkle tree
    // These values are calcalated off of the current highest level, level 0 and will be prepended to the levels array
    function _calculateNextLevel() {
        var nodes = [];
        var topLevel = tree.levels[0];
        var topLevelCount = topLevel.length;
        for (var x = 0; x < topLevelCount; x += 2) {
            if (x + 1 <= topLevelCount - 1) { // concatonate and hash the pair, add to the next level array
                nodes.push(hashFunction(Buffer.concat([topLevel[x], topLevel[x + 1]])));
            }
            else { // this is an odd ending node, promote up to the next level by itself
                nodes.push(topLevel[x]);
            }
        }
        return nodes;
    }
};

module.exports = MerkleTools;